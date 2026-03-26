/**
 * WebSocket RPC client for OpenClaw gateway (browser).
 *
 * Provides a singleton WebSocket connection with:
 * - Device keypair generation and storage (Ed25519)
 * - Challenge-response authentication with signature
 * - Request/response matching via id field
 * - Streaming support for methods like logs.tail
 * - React hooks for easy consumption
 */

import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519'

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

export type ConnectionState = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error'

interface DeviceIdentity {
  version: 1
  deviceId: string
  publicKey: string // base64url
  privateKey: string // base64url
  createdAtMs: number
}

interface ConnectChallenge {
  nonce: string
  ts: number
}

interface ConnectFrame {
  type: 'req'
  id: string
  method: 'connect'
  params: {
    minProtocol: number
    maxProtocol: number
    client: { id: string; version: string; platform: string; mode: string }
    device?: {
      id: string
      publicKey: string
      signature: string
      signedAt: number
      nonce: string
    }
    auth?: { token: string }
    role: 'operator'
    scopes: string[]
  }
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

type StreamHandler = (event: RpcResponse) => void

type ConnectionListener = (state: ConnectionState) => void

// ── Device Identity (Ed25519 Keypair) ─────────────────────────────────────────

const DEVICE_IDENTITY_KEY = 'openclaw-device-identity-v1'

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Convert Uint8Array to base64url string
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Convert base64url string to Uint8Array
 */
function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

/**
 * Device ID is SHA-256 hash of public key (hex encoded)
 */
async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  // Create a copy to ensure it's a proper ArrayBuffer-backed Uint8Array
  const keyCopy = new Uint8Array(publicKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyCopy)
  return bytesToHex(new Uint8Array(hashBuffer))
}

/**
 * Generate Ed25519 keypair and create device identity.
 * Device ID is SHA-256 hash of public key (not the public key itself).
 */
async function generateDeviceIdentity(): Promise<DeviceIdentity> {
  const privateKey = utils.randomSecretKey()
  const publicKey = await getPublicKeyAsync(privateKey)
  const deviceId = await fingerprintPublicKey(publicKey)

  return {
    version: 1,
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
    createdAtMs: Date.now(),
  }
}

/**
 * Sign a device auth payload string with Ed25519 private key.
 */
async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url)
  const data = new TextEncoder().encode(payload)
  const sig = await signAsync(data, key)
  return base64UrlEncode(sig)
}

/**
 * Build device auth payload string for signing (v2 format with pipe delimiter).
 */
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

/**
 * Load or create device identity from localStorage
 */
async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  if (typeof window === 'undefined') {
    throw new Error('Device identity can only be created in browser')
  }

  const stored = localStorage.getItem(DEVICE_IDENTITY_KEY)
  if (stored) {
    try {
      const identity = JSON.parse(stored) as DeviceIdentity
      if (identity.version === 1 && identity.publicKey && identity.privateKey) {
        return identity
      }
    } catch {
      // Invalid stored identity, generate new one
    }
  }

  const identity = await generateDeviceIdentity()
  localStorage.setItem(DEVICE_IDENTITY_KEY, JSON.stringify(identity))
  return identity
}

// ── Singleton State ─────────────────────────────────────────────────────────

let ws: WebSocket | null = null
let connectionState: ConnectionState = 'disconnected'
let connectionPromise: Promise<void> | null = null
let token: string | null = null
let gatewayPort = 18789
let deviceIdentity: DeviceIdentity | null = null

const pendingRequests = new Map<string, PendingRequest>()
const streamHandlers = new Map<string, StreamHandler>()
const stateListeners = new Set<ConnectionListener>()
let requestIdCounter = 0

// ── Configuration ───────────────────────────────────────────────────────────

const CONNECTION_TIMEOUT_MS = 10000
const RPC_TIMEOUT_MS = 30000

// ── Helper Functions ───────────────────────────────────────────────────────

function generateRequestId(): string {
  return `rpc-${Date.now()}-${++requestIdCounter}`
}

function getWebSocketUrl(): string {
  // Use the current page's protocol and host to construct WebSocket URL
  // For development, this will be ws://localhost:3000 which needs to proxy to gateway
  // For production, gateway should be accessible directly
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'

  // In development, we connect directly to gateway port
  // In production, we might need to go through the same origin
  if (process.env.NODE_ENV === 'development') {
    return `ws://localhost:${gatewayPort}/ws`
  }
  return `${protocol}://${window.location.host}/api/gateway/ws`
}

function setState(newState: ConnectionState): void {
  connectionState = newState
  stateListeners.forEach(listener => listener(newState))
}

// ── Connection Management ───────────────────────────────────────────────────

/**
 * Set the gateway token for authentication.
 * Must be called before connect().
 */
export function setGatewayToken(t: string): void {
  token = t
}

/**
 * Set the gateway port (default: 18789).
 */
export function setGatewayPort(port: number): void {
  gatewayPort = port
}

/**
 * Get current connection state.
 */
export function getConnectionState(): ConnectionState {
  return connectionState
}

/**
 * Subscribe to connection state changes.
 */
export function onConnectionStateChange(listener: ConnectionListener): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

/**
 * Handle incoming WebSocket messages.
 */
function handleMessage(data: string): void {
  let msg: RpcResponse
  try {
    msg = JSON.parse(data)
  } catch {
    console.error('[gateway-ws] Failed to parse message:', data)
    return
  }

  // Handle streaming events (type: 'ev' or 'event')
  if (msg.type === 'ev' || msg.type === 'event') {
    const eventName = msg.method || msg.event

    // Handle sessions.changed events - route to global handler
    if (eventName === 'sessions.changed' && msg.payload) {
      const payload = msg.payload as SessionsChangedPayload
      if (payload.sessionKey && globalSessionsChangedHandler) {
        globalSessionsChangedHandler(payload)
      }
      return
    }

    // Handle session.tool events - route to global handler
    if (eventName === 'session.tool' && msg.payload) {
      const payload = msg.payload as SessionToolPayload
      if (payload.sessionKey && globalSessionToolHandler) {
        globalSessionToolHandler(payload)
      }
      return
    }

    // Handle session.message events - route to global handler
    if (eventName === 'session.message' && msg.payload) {
      const payload = msg.payload as SessionMessagePayload
      if (payload.sessionKey && globalSessionMessageHandler) {
        globalSessionMessageHandler(payload)
      }
      return
    }

    // Handle other session.* events - log for documentation
    if (eventName?.startsWith('session.') && msg.payload) {
      console.log('[gateway-ws] session event:', JSON.stringify(msg, null, 2))
      return
    }

    // Handle chat events - route to global handler
    if (eventName === 'chat' && msg.payload) {
      const payload = msg.payload as ChatEventPayload
      if (payload.sessionKey && globalChatEventHandler) {
        globalChatEventHandler(payload)
      }
      return
    }

    // Handle agent stream events - route to global handler
    if (eventName === 'agent' && msg.payload) {
      const payload = msg.payload as AgentStreamPayload
      if (payload.sessionKey && globalAgentStreamHandler) {
        globalAgentStreamHandler(payload)
      }
      return
    }

    // Other streaming events
    if (eventName) {
      const handler = streamHandlers.get(eventName)
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
    const pending = pendingRequests.get(msg.id)
    if (pending) {
      pendingRequests.delete(msg.id)
      clearTimeout(pending.timeout)

      if (msg.type === 'res') {
        pending.resolve(msg.result ?? msg.payload)
      } else if (msg.type === 'err') {
        pending.reject(new Error(msg.error?.message || 'RPC error'))
      }
    }
  }
}

async function sendConnectFrame(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ws || !token) {
      reject(new Error('WebSocket not ready or token not set'))
      return
    }

    if (!deviceIdentity) {
      reject(new Error('Device identity not loaded'))
      return
    }

    const connectId = `conn-${Date.now()}`

    const timeout = setTimeout(() => {
      reject(new Error('Connection authentication timeout'))
    }, CONNECTION_TIMEOUT_MS)

    const handleMessage = async (event: MessageEvent) => {
      try {
        const msg: RpcResponse = JSON.parse(event.data)

        // Handle connect.challenge event
        if ((msg.type === 'ev' || msg.type === 'event') && msg.event === 'connect.challenge' && msg.payload) {
          const challenge = msg.payload as ConnectChallenge
          setState('authenticating')

          // Build auth payload (v2 format)
          const signedAtMs = Date.now()
          const payload = buildDeviceAuthPayload({
            deviceId: deviceIdentity!.deviceId,
            clientId: 'openclaw-control-ui',
            clientMode: 'webchat',
            role: 'operator',
            scopes: ['operator.admin', 'operator.read', 'operator.write'],
            signedAtMs,
            nonce: challenge.nonce,
            token: token!,
          })

          // Sign the payload string
          const signature = await signDevicePayload(deviceIdentity!.privateKey, payload)

          // Send signed connect frame
          const signedConnectFrame: ConnectFrame = {
            type: 'req',
            id: `${connectId}-signed`,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: 'openclaw-control-ui', version: '2026.3.13', platform: 'browser', mode: 'webchat' },
              device: {
                id: deviceIdentity!.deviceId,
                publicKey: deviceIdentity!.publicKey,
                signature,
                signedAt: signedAtMs,
                nonce: challenge.nonce,
              },
              auth: { token: token! },
              role: 'operator',
              scopes: ['operator.admin', 'operator.read', 'operator.write'],
            },
          }

          ws!.send(JSON.stringify(signedConnectFrame))
          return
        }

        // Handle connect response
        if (msg.id === `${connectId}-signed`) {
          if (msg.type === 'res') {
            clearTimeout(timeout)
            ws!.removeEventListener('message', handleMessage)
            setState('connected')
            resolve()
          } else if (msg.type === 'err') {
            clearTimeout(timeout)
            ws!.removeEventListener('message', handleMessage)
            setState('error')
            reject(new Error(msg.error?.message || 'Connection rejected'))
          }
          return
        }

        // Ignore other messages during authentication
      } catch (err) {
        clearTimeout(timeout)
        reject(err)
      }
    }

    ws.addEventListener('message', handleMessage)

    // Don't send initial connect frame - wait for gateway to send challenge
    // The gateway will send a connect.challenge event when WebSocket opens
  })
}

/**
 * Connect to the gateway WebSocket.
 */
export async function connect(): Promise<void> {
  if (connectionState === 'connected' && ws?.readyState === WebSocket.OPEN) {
    return
  }

  if (connectionPromise) {
    return connectionPromise
  }

  if (!token) {
    throw new Error('Gateway token not set. Call setGatewayToken() first.')
  }

  // Load or create device identity
  if (!deviceIdentity) {
    deviceIdentity = await loadOrCreateDeviceIdentity()
  }

  setState('connecting')
  connectionPromise = (async () => {
    try {
      // Close existing connection
      if (ws) {
        ws.close()
        ws = null
      }

      const url = getWebSocketUrl()
      ws = new WebSocket(url)

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'))
        }, CONNECTION_TIMEOUT_MS)

        ws!.onopen = () => {
          clearTimeout(timeout)
          resolve()
        }
        ws!.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('WebSocket connection failed'))
        }
        ws!.onclose = () => {
          setState('disconnected')
        }
      })

      ws.onmessage = (event) => handleMessage(event.data)
      ws.onerror = () => {
        console.error('[gateway-ws] WebSocket error')
        setState('error')
      }
      ws.onclose = () => {
        setState('disconnected')
        // Reject all pending requests
        for (const [, pending] of pendingRequests) {
          clearTimeout(pending.timeout)
          pending.reject(new Error('Connection closed'))
        }
        pendingRequests.clear()
        streamHandlers.clear()
      }

      await sendConnectFrame()
    } finally {
      connectionPromise = null
    }
  })()

  return connectionPromise
}

/**
 * Disconnect from the gateway.
 */
export function disconnect(): void {
  if (ws) {
    ws.close()
    ws = null
  }
  setState('disconnected')
  connectionPromise = null
  pendingRequests.clear()
  streamHandlers.clear()
}

// ── RPC API ────────────────────────────────────────────────────────────────

/**
 * Make an RPC call over WebSocket.
 * Automatically connects if not already connected.
 */
export async function callRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = RPC_TIMEOUT_MS
): Promise<T> {
  await connect()

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket not connected')
  }

  const id = generateRequestId()
  const request: RpcRequest = {
    type: 'req',
    id,
    method,
    params,
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`RPC call ${method} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    pendingRequests.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
      timeout,
    })

    ws!.send(JSON.stringify(request))
  })
}

/**
 * Subscribe to a streaming RPC method.
 */
export async function subscribeStream(
  method: string,
  params: Record<string, unknown>,
  onEvent: (event: RpcResponse) => void,
  timeoutMs = RPC_TIMEOUT_MS
): Promise<void> {
  await connect()

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket not connected')
  }

  const id = generateRequestId()
  const request: RpcRequest = {
    type: 'req',
    id,
    method,
    params,
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Stream subscription ${method} timed out`))
    }, timeoutMs)

    streamHandlers.set(method, onEvent)

    pendingRequests.set(id, {
      resolve: () => resolve(),
      reject,
      timeout,
    })

    ws!.send(JSON.stringify(request))
  })
}

/**
 * Unsubscribe from a streaming RPC method.
 */
export function unsubscribeStream(method: string): void {
  streamHandlers.delete(method)
}

// ── Convenience RPC Wrappers ────────────────────────────────────────────────

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

export interface AgentIdentity {
  agentId: string
  name: string
  avatar: string // Single character or emoji
}

export async function agentIdentityGet(agentId: string): Promise<AgentIdentity | null> {
  try {
    const sessionKey = `agent:${agentId}:identity`
    const result = await callRpc<AgentIdentity>('agent.identity.get', { sessionKey })
    return result
  } catch {
    // Agent might not have identity configured
    return null
  }
}

export async function memoryStatus(deep = true): Promise<unknown> {
  return callRpc('doctor.memory.status', { deep })
}

export async function memoryReindex(): Promise<unknown> {
  return callRpc('memory.reindex', {})
}

// ── Chat API ───────────────────────────────────────────────────────────────

export interface TextContent {
  type: 'text'
  text: string
}

export interface ToolCallContent {
  type: 'toolCall'
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResultContent {
  type: 'toolResult'
  toolCallId: string
  toolName: string
  content: Array<{ type: string; text?: string }>
  isError?: boolean
}

export type MessageContent = string | Array<TextContent | ToolCallContent | ToolResultContent | { type: string; [key: string]: unknown }>

export interface ChatMessage {
  role: 'user' | 'assistant' | 'toolResult'
  content: MessageContent
  timestamp?: number
  // toolResult-specific fields
  toolCallId?: string
  toolName?: string
  isError?: boolean
  // Subagent task completion (sourceTool: subagent_announce)
  provenance?: {
    kind?: string
    sourceSessionKey?: string
    sourceChannel?: string
    sourceTool?: string
  }
  __openclaw?: {
    id: string
    seq: number
  }
}

export interface ChatHistoryResult {
  sessionKey?: string
  sessionId?: string
  messages: ChatMessage[]
}

export interface ChatSendResult {
  runId: string
  status: string
}

export interface ChatEventPayload {
  runId: string
  sessionKey: string
  state: 'delta' | 'final' | 'aborted' | 'error'
  message?: ChatMessage
  errorMessage?: string
}

/**
 * Agent stream event payload.
 * These events have "delta" field for incremental content.
 */
export interface AgentStreamPayload {
  runId: string
  sessionKey: string
  stream: 'lifecycle' | 'assistant' | 'tool'
  data: {
    phase?: 'start' | 'end'
    startedAt?: number
    endedAt?: number
    text?: string      // Full text so far
    delta?: string     // Incremental text (only in assistant stream)
    toolName?: string
    toolInput?: unknown
    toolResult?: unknown
  }
}

type ChatEventHandler = (event: ChatEventPayload) => void
type AgentStreamHandler = (event: AgentStreamPayload) => void

// Global event handlers (called for all events, routed by sessionKey)
let globalChatEventHandler: ChatEventHandler | null = null
let globalAgentStreamHandler: AgentStreamHandler | null = null

/**
 * Register a global handler for all chat events.
 * The handler receives all events and is responsible for routing by sessionKey.
 */
export function registerChatEventHandler(handler: ChatEventHandler | null): void {
  globalChatEventHandler = handler
}

/**
 * Register a global handler for all agent stream events.
 * The handler receives all events and is responsible for routing by sessionKey.
 */
export function registerAgentStreamHandler(handler: AgentStreamHandler | null): void {
  globalAgentStreamHandler = handler
}

// ── Sessions Changed Event ─────────────────────────────────────────────

export interface SessionChangedData {
  key: string
  status: 'running' | 'done' | 'error' | 'idle'
  startedAt?: number
  endedAt?: number
  runtimeMs?: number
  model?: string
  contextTokens?: number
  updatedAt?: number
}

export interface SessionsChangedPayload {
  sessionKey: string
  phase: 'start' | 'message' | 'end'
  ts: number
  runId?: string
  messageId?: string
  messageSeq?: number
  session: SessionChangedData
}

type SessionsChangedHandler = (event: SessionsChangedPayload) => void

let globalSessionsChangedHandler: SessionsChangedHandler | null = null

/**
 * Register a global handler for sessions.changed events.
 * Use this to update session running status in UI.
 */
export function registerSessionsChangedHandler(handler: SessionsChangedHandler | null): void {
  globalSessionsChangedHandler = handler
}

// ── Session Tool Event ─────────────────────────────────────────────

export interface SessionToolPayload {
  runId: string
  sessionKey: string
  stream: 'tool'
  seq?: number
  ts?: number
  data: {
    phase: 'start' | 'update' | 'result'
    name: string
    toolCallId: string
    args?: Record<string, unknown>      // Only in 'start'
    meta?: string                        // Only in 'result'
    isError?: boolean                    // Only in 'result'
  }
}

type SessionToolHandler = (event: SessionToolPayload) => void

let globalSessionToolHandler: SessionToolHandler | null = null

/**
 * Register a global handler for session.tool events.
 * Use this to render tool execution in chat UI.
 */
export function registerSessionToolHandler(handler: SessionToolHandler | null): void {
  globalSessionToolHandler = handler
}

// ── Session Message Event ─────────────────────────────────────────────

export interface SessionMessagePayload {
  sessionKey: string
  message: ChatMessage
  messageId?: string
  messageSeq?: number
  session?: SessionChangedData
}

type SessionMessageHandler = (event: SessionMessagePayload) => void

let globalSessionMessageHandler: SessionMessageHandler | null = null

/**
 * Register a global handler for session.message events.
 * Use this to add messages (user and assistant) to chat UI.
 */
export function registerSessionMessageHandler(handler: SessionMessageHandler | null): void {
  globalSessionMessageHandler = handler
}

// ── Sessions API ─────────────────────────────────────────────────────

export interface SessionInfo {
  key: string
  kind?: string
  chatType?: string
  origin?: {
    provider?: string
    surface?: string
    chatType?: string
  }
  updatedAt?: number
  sessionId?: string
  systemSent?: boolean
  model?: string
  contextTokens?: number
  title?: string
  label?: string
  // Running state fields
  status?: 'running' | 'done' | 'error' | 'aborted'
  startedAt?: number
  runtimeMs?: number
  spawnedBy?: string
  displayName?: string
  channel?: string
}

export interface SessionsListResult {
  sessions: SessionInfo[]
  total?: number
}

/**
 * List all sessions, optionally filtered by agentId.
 */
export async function sessionsList(options: {
  limit?: number
  agentId?: string
  includeGlobal?: boolean
  includeUnknown?: boolean
  search?: string
} = {}): Promise<SessionsListResult> {
  const result = await callRpc<SessionsListResult>('sessions.list', {
    limit: options.limit ?? 120,
    agentId: options.agentId,
    // When filtering by agentId, don't include global sessions
    includeGlobal: options.agentId ? false : (options.includeGlobal ?? true),
    includeUnknown: options.includeUnknown ?? false,
    search: options.search,
  })
  return result || { sessions: [] }
}

// ── Models API ──────────────────────────────────────────────────────

export interface ModelInfo {
  id: string
  name?: string
  provider?: string
  contextWindow?: number
  inputPrice?: number
  outputPrice?: number
}

export interface ModelsListResult {
  models: ModelInfo[]
  default?: string
}

/**
 * List available models.
 */
export async function modelsList(): Promise<ModelsListResult> {
  const result = await callRpc<ModelsListResult>('models.list', {})
  return result || { models: [] }
}

/**
 * Patch session to update model.
 */
export async function sessionsPatch(sessionKey: string, patch: {
  model?: string
  title?: string
  label?: string
}): Promise<void> {
  await callRpc('sessions.patch', {
    key: sessionKey,
    ...patch,
  })
}

/**
 * Delete a session.
 */
export async function sessionsDelete(sessionKey: string): Promise<void> {
  await callRpc('sessions.delete', { key: sessionKey })
}

/**
 * Subscribe to all session lifecycle events.
 * Should be called once after connection is established.
 * Events will be received as "session.*" events.
 */
export async function sessionsSubscribe(): Promise<{ subscribed: boolean }> {
  const result = await callRpc<{ subscribed: boolean }>('sessions.subscribe', {})
  return result || { subscribed: false }
}

/**
 * Subscribe to message events for a running session.
 * This is needed when refreshing the page while a session is running,
 * to start receiving real-time events again.
 */
export async function sessionsMessagesSubscribe(sessionKey: string): Promise<void> {
  await callRpc('sessions.messages.subscribe', { key: sessionKey })
}

/**
 * Unsubscribe from session message events.
 * Should be called when a running session ends before sending new messages,
 * to avoid receiving duplicate events.
 */
export async function sessionsMessagesUnsubscribe(sessionKey: string): Promise<void> {
  await callRpc('sessions.messages.unsubscribe', { key: sessionKey })
}

/**
 * Get chat history for a session.
 */
export async function chatHistory(sessionKey: string, limit = 100): Promise<ChatHistoryResult> {
  const result = await callRpc<ChatHistoryResult>('chat.history', {
    sessionKey,
    limit,
  })
  return result || { messages: [] }
}

/**
 * Send a chat message via WebSocket.
 * Returns runId, actual response comes via events.
 */
export async function chatSend(params: {
  sessionKey: string
  message: string
  attachments?: Array<{ type: string; mimeType: string; content: string }>
  idempotencyKey?: string
  timeoutMs?: number
}): Promise<ChatSendResult> {
  const result = await callRpc<ChatSendResult>('chat.send', {
    sessionKey: params.sessionKey,
    message: params.message,
    attachments: params.attachments,
    idempotencyKey: params.idempotencyKey || `chat-${Date.now()}`,
    deliver: false,
    timeoutMs: params.timeoutMs,
  })
  return result
}

/**
 * Abort a running chat.
 */
export async function chatAbort(sessionKey: string, runId?: string): Promise<void> {
  await callRpc('chat.abort', {
    sessionKey,
    runId,
  })
}

// ── React Hooks ─────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef } from 'react'

/**
 * Hook to get connection state and manage connection.
 */
export function useGatewayConnection() {
  const [state, setState] = useState<ConnectionState>(getConnectionState())

  useEffect(() => {
    return onConnectionStateChange(setState)
  }, [])

  return {
    state,
    connect,
    disconnect,
    isConnected: state === 'connected',
  }
}

/**
 * Hook to fetch data via RPC.
 */
export function useRpc<T>(
  method: string | null,
  params: Record<string, unknown> = {},
  options: {
    autoFetch?: boolean
    refreshInterval?: number
    timeoutMs?: number
  } = {}
) {
  const { autoFetch = true, refreshInterval, timeoutMs } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetch = useCallback(async () => {
    if (!method) return

    setLoading(true)
    setError(null)
    try {
      const result = await callRpc<T>(method, params, timeoutMs)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [method, JSON.stringify(params), timeoutMs])

  useEffect(() => {
    if (autoFetch && method) {
      fetch()
    }
  }, [fetch, autoFetch, method])

  useEffect(() => {
    if (refreshInterval && method) {
      const interval = setInterval(fetch, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetch, refreshInterval, method])

  return { data, loading, error, refetch: fetch }
}

/**
 * Hook to subscribe to a streaming RPC.
 */
export function useStream(
  method: string | null,
  params: Record<string, unknown> = {},
  onEvent: (event: RpcResponse) => void
) {
  const [subscribed, setSubscribed] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!method) return

    let mounted = true
    subscribeStream(method, params, (event) => {
      if (mounted) onEventRef.current(event)
    })
      .then(() => {
        if (mounted) setSubscribed(true)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err : new Error(String(err)))
      })

    return () => {
      mounted = false
      unsubscribeStream(method)
      setSubscribed(false)
    }
  }, [method, JSON.stringify(params)])

  return { subscribed, error }
}