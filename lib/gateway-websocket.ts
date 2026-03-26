/**
 * WebSocket RPC client for OpenClaw gateway.
 *
 * Uses a connection pool pattern for stateless backend operations:
 * - Connections are borrowed from the pool for each request
 * - Idle connections are closed after a timeout
 * - Each request is isolated (no shared pending requests across connections)
 * - Max pool size limits resource usage
 */

import WS from 'ws'
import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519'
import { gatewayPort, gatewayToken } from './env'

// ── Types ───────────────────────────────────────────────────────────────────

interface RpcRequest {
  type: 'req'
  id: string
  method: string
  params: Record<string, unknown>
}

export interface RpcResponse {
  type: 'res' | 'err' | 'ev' | 'event'
  id?: string
  event?: string
  method?: string
  result?: unknown
  payload?: unknown
  ok?: boolean
  error?: { code: string | number; message: string; details?: unknown }
  params?: Record<string, unknown>
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

type StreamHandler = (event: RpcResponse) => void

interface PooledConnection {
  ws: WS
  lastUsed: number
  inUse: boolean
  pendingRequests: Map<string, PendingRequest>
  streamHandlers: Map<string, StreamHandler>
}

// ── Device Identity (Ed25519 Keypair) ─────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return Buffer.from(binary, 'binary').toString('base64url')
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = Buffer.from(padded, 'base64').toString('binary')
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

// Device ID is SHA-256 hash of public key (hex encoded)
async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  // Create a copy to ensure it's a proper ArrayBuffer-backed Uint8Array
  const keyCopy = new Uint8Array(publicKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyCopy)
  return bytesToHex(new Uint8Array(hashBuffer))
}

async function generateDeviceIdentity() {
  const privateKey = utils.randomSecretKey()
  const publicKey = await getPublicKeyAsync(privateKey)
  const deviceId = await fingerprintPublicKey(publicKey)

  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  }
}

async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url)
  const data = new TextEncoder().encode(payload)
  const sig = await signAsync(data, key)
  return base64UrlEncode(sig)
}

// Build device auth payload string for signing (v2 format with pipe delimiter)
function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token: string | null
  nonce: string
}): string {
  const scopesStr = params.scopes.join(',')
  const tokenStr = params.token ?? ''
  // v2 format: v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
  return [
    'v2',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopesStr,
    params.signedAtMs.toString(),
    tokenStr,
    params.nonce,
  ].join('|')
}

// ── Pool Configuration ─────────────────────────────────────────────────────

const MAX_POOL_SIZE = 5
const IDLE_TIMEOUT_MS = 30000 // 30 seconds
const CONNECTION_TIMEOUT_MS = 10000
const RPC_TIMEOUT_MS = 30000

// ── Pool State ─────────────────────────────────────────────────────────────

const pool: PooledConnection[] = []
let requestIdCounter = 0
let idleCheckInterval: ReturnType<typeof setInterval> | null = null

// ── Helper Functions ───────────────────────────────────────────────────────

function generateRequestId(): string {
  return `rpc-${Date.now()}-${++requestIdCounter}`
}

function getWebSocketUrl(): string {
  const port = gatewayPort()
  return `ws://localhost:${port}/ws`
}

function startIdleCheck(): void {
  if (idleCheckInterval) return
  idleCheckInterval = setInterval(() => {
    const now = Date.now()
    for (let i = pool.length - 1; i >= 0; i--) {
      const conn = pool[i]
      if (!conn.inUse && now - conn.lastUsed > IDLE_TIMEOUT_MS) {
        closeConnection(conn)
        pool.splice(i, 1)
      }
    }
    if (pool.length === 0 && idleCheckInterval) {
      clearInterval(idleCheckInterval)
      idleCheckInterval = null
    }
  }, IDLE_TIMEOUT_MS / 2)
}

function closeConnection(conn: PooledConnection): void {
  try {
    conn.ws.close()
  } catch { /* ignore */ }

  // Reject all pending requests
  for (const [, pending] of conn.pendingRequests) {
    clearTimeout(pending.timeout)
    pending.reject(new Error('Connection closed'))
  }
  conn.pendingRequests.clear()
  conn.streamHandlers.clear()
}

// ── Connection Management ───────────────────────────────────────────────────

async function createConnection(): Promise<PooledConnection> {
  const url = getWebSocketUrl()
  const ws = new WS(url, {
    headers: {
      'Origin': 'http://127.0.0.1:3000',
    },
  })

  const conn: PooledConnection = {
    ws,
    lastUsed: Date.now(),
    inUse: false,
    pendingRequests: new Map(),
    streamHandlers: new Map(),
  }

  const token = gatewayToken()
  if (!token) {
    throw new Error('OPENCLAW_GATEWAY_TOKEN not configured')
  }

  // Generate device identity for this connection
  const deviceIdentity = await generateDeviceIdentity()
  const connectId = `conn-${Date.now()}`

  return new Promise((resolve, reject) => {
    const authTimeout = setTimeout(() => {
      cleanup()
      reject(new Error('Connection authentication timeout'))
    }, CONNECTION_TIMEOUT_MS)

    const cleanup = () => {
      ws.off('message', handleAuthMessage)
      clearTimeout(authTimeout)
    }

    // Message handler for challenge-response flow
    const handleAuthMessage = async (data: WS.RawData) => {
      try {
        const msg: RpcResponse = JSON.parse(String(data))

        // Handle connect.challenge event
        if ((msg.type === 'ev' || msg.type === 'event') && msg.event === 'connect.challenge' && msg.payload) {
          const challenge = msg.payload as { nonce: string; ts: number }

          // Build auth payload (v2 format)
          const signedAtMs = Date.now()
          const payload = buildDeviceAuthPayload({
            deviceId: deviceIdentity.deviceId,
            clientId: 'openclaw-control-ui',
            clientMode: 'webchat',
            role: 'operator',
            scopes: ['operator.admin', 'operator.read', 'operator.write'],
            signedAtMs,
            token,
            nonce: challenge.nonce,
          })

          // Sign the payload
          const signature = await signDevicePayload(deviceIdentity.privateKey, payload)

          // Send signed connect frame
          const signedFrame = {
            type: 'req',
            id: `${connectId}-signed`,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: 'openclaw-control-ui', version: '2026.3.13', platform: 'node', mode: 'webchat' },
              device: {
                id: deviceIdentity.deviceId,
                publicKey: deviceIdentity.publicKey,
                signature,
                signedAt: signedAtMs,
                nonce: challenge.nonce,
              },
              auth: { token },
              role: 'operator',
              scopes: ['operator.admin', 'operator.read', 'operator.write'],
            },
          }

          ws.send(JSON.stringify(signedFrame))
          return
        }

        // Handle connect response
        if (msg.id === connectId || msg.id === `${connectId}-signed`) {
          cleanup()

          if (msg.type === 'res') {
            // Set up regular message handler
            ws.on('message', (data) => handleMessage(conn, data.toString()))
            resolve(conn)
          } else if (msg.type === 'err') {
            reject(new Error(msg.error?.message || 'Connection rejected'))
          }
        }
      } catch (err) {
        cleanup()
        reject(err)
      }
    }

    // Set up event handlers immediately
    ws.on('open', () => {
      // Connected, waiting for challenge from gateway
    })

    ws.on('message', handleAuthMessage)

    ws.on('error', (err) => {
      cleanup()
      reject(new Error(`WebSocket error: ${err.message}`))
    })

    ws.on('close', () => {
      cleanup()
      // Clean up pending requests
      for (const [, pending] of conn.pendingRequests) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Connection closed'))
      }
      conn.pendingRequests.clear()
      conn.streamHandlers.clear()
    })
  })
}

function handleMessage(conn: PooledConnection, data: string): void {
  let msg: RpcResponse
  try {
    msg = JSON.parse(data)
  } catch {
    console.error('[gateway-ws] Failed to parse message:', data)
    return
  }

  // Handle streaming events (type: 'ev' or 'event')
  if (msg.type === 'ev' || msg.type === 'event') {
    // Check both method and event fields for routing
    const key = msg.method || msg.event
    if (key) {
      const handler = conn.streamHandlers.get(key)
      if (handler) {
        handler(msg)
        return
      }
    }
    // Ignore unhandled events
    return
  }

  // Handle regular responses
  if (msg.id) {
    const pending = conn.pendingRequests.get(msg.id)
    if (pending) {
      conn.pendingRequests.delete(msg.id)
      clearTimeout(pending.timeout)

      if (msg.type === 'res') {
        // Gateway may return result or payload depending on method
        pending.resolve(msg.result ?? msg.payload)
      } else if (msg.type === 'err') {
        pending.reject(new Error(msg.error?.message || 'RPC error'))
      }
    }
  }
}

/**
 * Acquire a connection from the pool.
 * Creates a new one if pool is empty or all connections are in use.
 */
async function acquire(): Promise<PooledConnection> {
  // Find an available connection
  for (const conn of pool) {
    if (!conn.inUse && conn.ws.readyState === WebSocket.OPEN) {
      conn.inUse = true
      conn.lastUsed = Date.now()
      return conn
    }
  }

  // Create new connection if pool not full
  if (pool.length < MAX_POOL_SIZE) {
    startIdleCheck()
    const conn = await createConnection()
    conn.inUse = true
    pool.push(conn)
    return conn
  }

  // Wait for a connection to become available
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      for (const conn of pool) {
        if (!conn.inUse && conn.ws.readyState === WebSocket.OPEN) {
          clearInterval(checkInterval)
          conn.inUse = true
          conn.lastUsed = Date.now()
          resolve(conn)
          return
        }
      }
    }, 100)

    setTimeout(() => {
      clearInterval(checkInterval)
      reject(new Error('Connection pool exhausted'))
    }, CONNECTION_TIMEOUT_MS)
  })
}

/**
 * Release a connection back to the pool.
 */
function release(conn: PooledConnection): void {
  conn.inUse = false
  conn.lastUsed = Date.now()
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Make an RPC call over WebSocket.
 *
 * @param method - RPC method name (e.g., 'cron.list', 'agents.list')
 * @param params - Method parameters
 * @param timeoutMs - Request timeout in milliseconds (default: 30000)
 * @returns Promise resolving to the result
 */
export async function callRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = RPC_TIMEOUT_MS
): Promise<T> {
  const conn = await acquire()

  try {
    const id = generateRequestId()
    const request: RpcRequest = {
      type: 'req',
      id,
      method,
      params,
    }

    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.pendingRequests.delete(id)
        reject(new Error(`RPC call ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      conn.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      })

      conn.ws.send(JSON.stringify(request))
    })
  } finally {
    release(conn)
  }
}

/**
 * Subscribe to a streaming RPC method (e.g., 'logs.tail').
 *
 * Note: The connection stays acquired until the returned release function is called.
 *
 * @param method - RPC method name
 * @param params - Method parameters
 * @param onEvent - Callback for each event
 * @param timeoutMs - Initial response timeout (default: 30000)
 * @returns Promise resolving to a release function
 */
export async function subscribeStream(
  method: string,
  params: Record<string, unknown>,
  onEvent: (event: RpcResponse) => void,
  timeoutMs = RPC_TIMEOUT_MS
): Promise<() => void> {
  const conn = await acquire()

  const id = generateRequestId()
  const request: RpcRequest = {
    type: 'req',
    id,
    method,
    params,
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.pendingRequests.delete(id)
      release(conn)
      reject(new Error(`Stream subscription ${method} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    conn.streamHandlers.set(method, onEvent)

    conn.pendingRequests.set(id, {
      resolve: () => resolve(),
      reject,
      timeout,
    })

    conn.ws.send(JSON.stringify(request))
  })

  // Return a release function that the caller must call when done
  return () => {
    conn.streamHandlers.delete(method)
    release(conn)
  }
}

/**
 * Unsubscribe from a streaming RPC method.
 * @deprecated Use the release function returned from subscribeStream instead.
 */
export function unsubscribeStream(method: string): void {
  // Find the connection that has this stream handler
  for (const conn of pool) {
    if (conn.streamHandlers.has(method)) {
      conn.streamHandlers.delete(method)
      release(conn)
      break
    }
  }
}

/**
 * Close all connections in the pool.
 */
export function closeAllConnections(): void {
  for (const conn of pool) {
    closeConnection(conn)
  }
  pool.length = 0

  if (idleCheckInterval) {
    clearInterval(idleCheckInterval)
    idleCheckInterval = null
  }
}

/**
 * Get pool statistics.
 */
export function getPoolStats(): { total: number; inUse: number; idle: number } {
  return {
    total: pool.length,
    inUse: pool.filter(c => c.inUse).length,
    idle: pool.filter(c => !c.inUse).length,
  }
}

// ── Convenience RPC Wrappers ────────────────────────────────────────────────

/**
 * Call cron.list RPC.
 */
export async function cronList(): Promise<unknown[]> {
  const result = await callRpc<{ jobs?: unknown[] } | unknown[]>('cron.list', {})
  // Gateway returns { jobs: [...], total, offset, ... }
  if (result && typeof result === 'object' && 'jobs' in result && Array.isArray(result.jobs)) {
    return result.jobs
  }
  // Fallback for array response
  if (Array.isArray(result)) return result
  return []
}

/**
 * Call agents.list RPC.
 */
export async function agentsList(): Promise<unknown[]> {
  const result = await callRpc<{ agents?: unknown[] } | unknown[]>('agents.list', {})
  // Gateway returns { agents: [...], defaultId, mainKey, scope }
  if (result && typeof result === 'object' && 'agents' in result && Array.isArray(result.agents)) {
    return result.agents
  }
  // Fallback for array response
  if (Array.isArray(result)) return result
  return []
}

/**
 * Call doctor.memory.status RPC.
 */
export async function memoryStatus(deep = true): Promise<unknown> {
  return callRpc('doctor.memory.status', { deep })
}

/**
 * Call memory.reindex RPC.
 */
export async function memoryReindex(): Promise<unknown> {
  return callRpc('memory.reindex', {})
}

/**
 * Call chat.send RPC (for vision messages).
 */
export async function chatSend(opts: {
  sessionKey: string
  idempotencyKey: string
  message: string
  attachments?: Array<{ mimeType: string; content: string }>
}): Promise<{ status: string; runId?: string }> {
  return callRpc('chat.send', {
    sessionKey: opts.sessionKey,
    idempotencyKey: opts.idempotencyKey,
    message: opts.message,
    attachments: opts.attachments || [],
  })
}

/**
 * Call chat.history RPC.
 */
export async function chatHistory(sessionKey: string): Promise<{ messages: Array<{
  role: string
  content: string | Array<{ type: string; text?: string }>
  timestamp: number
}> }> {
  return callRpc('chat.history', { sessionKey })
}