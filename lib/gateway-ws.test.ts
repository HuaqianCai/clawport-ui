/**
 * WebSocket RPC integration tests for OpenClaw gateway.
 *
 * These tests require a running OpenClaw gateway at ws://localhost:18789/ws
 * Run: openclaw gateway run
 *
 * Set SKIP_GATEWAY_TESTS=1 to skip these tests if gateway is not available.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Skip tests if gateway is not available
const shouldSkip = process.env.SKIP_GATEWAY_TESTS === '1'

const GATEWAY_URL = process.env.GATEWAY_WS_URL || 'ws://localhost:18789/ws'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ''

// ── Types ───────────────────────────────────────────────────────────────────

interface RpcRequest {
  type: 'req'
  id: string
  method: string
  params: Record<string, unknown>
}

interface RpcResponse {
  type: 'res' | 'err' | 'ev'
  id?: string
  event?: string
  method?: string
  result?: unknown
  payload?: unknown
  error?: { code: string | number; message: string }
  params?: Record<string, unknown>
}

interface DeviceIdentity {
  version: 1
  deviceId: string
  publicKey: string
  privateKey: string
  createdAtMs: number
}

// ── Crypto Helpers (browser-compatible) ──────────────────────────────────────

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return Buffer.from(binary, 'binary').toString('base64url')
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const binary = Buffer.from(base64url, 'base64url').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function generateDeviceId(): string {
  const bytes = new Uint8Array(32)
  // In Node.js test environment, use crypto module
  require('crypto').randomFillSync(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function generateDeviceIdentity(): Promise<DeviceIdentity> {
  const { publicKey, privateKey } = await require('crypto').subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  )

  const publicKeyRaw = await require('crypto').subtle.exportKey('raw', publicKey)
  const privateKeyRaw = await require('crypto').subtle.exportKey('pkcs8', privateKey)
  const privateKeyBytes = new Uint8Array(privateKeyRaw).slice(-32)

  return {
    version: 1,
    deviceId: generateDeviceId(),
    publicKey: arrayBufferToBase64Url(publicKeyRaw),
    privateKey: arrayBufferToBase64Url(privateKeyBytes.buffer),
    createdAtMs: Date.now(),
  }
}

async function importPrivateKey(base64url: string): Promise<CryptoKey> {
  const privateKeyBytes = new Uint8Array(base64UrlToArrayBuffer(base64url))
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ])
  const pkcs8Data = new Uint8Array(pkcs8Prefix.length + privateKeyBytes.length)
  pkcs8Data.set(pkcs8Prefix, 0)
  pkcs8Data.set(privateKeyBytes, pkcs8Prefix.length)

  return require('crypto').subtle.importKey(
    'pkcs8',
    pkcs8Data.buffer,
    { name: 'Ed25519' },
    false,
    ['sign']
  )
}

async function signWithDeviceKey(privateKeyBase64: string, message: string): Promise<string> {
  const privateKey = await importPrivateKey(privateKeyBase64)
  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(message)
  const signature = await require('crypto').subtle.sign('Ed25519', privateKey, messageBytes)
  return arrayBufferToBase64Url(signature)
}

// ── WebSocket RPC Client for Testing ────────────────────────────────────────

import WebSocket from 'ws'

class TestRpcClient {
  private ws: WebSocket | null = null
  private requestId = 0
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private deviceIdentity: DeviceIdentity | null = null
  private messageHandlers: Array<(data: WebSocket.RawData) => void> = []

  async connect(timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, timeout)

      this.ws = new WebSocket(GATEWAY_URL)

      this.ws.on('open', () => {
        clearTimeout(timeoutId)
        resolve()
      })

      this.ws.on('error', (err) => {
        clearTimeout(timeoutId)
        reject(new Error(`WebSocket error: ${err.message}`))
      })

      // Single message handler that dispatches to all registered handlers
      this.ws.on('message', (data) => {
        // First, try to handle as RPC response
        try {
          const msg: RpcResponse = JSON.parse(data.toString())
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const pending = this.pendingRequests.get(msg.id)!
            this.pendingRequests.delete(msg.id)
            if (msg.type === 'res') {
              pending.resolve(msg.result)
            } else if (msg.type === 'err') {
              pending.reject(new Error(msg.error?.message || 'RPC error'))
            }
            return
          }
        } catch {
          // Not JSON or not an RPC response
        }

        // Dispatch to custom handlers
        for (const handler of this.messageHandlers) {
          handler(data)
        }
      })
    })
  }

  addMessageHandler(handler: (data: WebSocket.RawData) => void): void {
    this.messageHandlers.push(handler)
  }

  removeMessageHandler(handler: (data: WebSocket.RawData) => void): void {
    const idx = this.messageHandlers.indexOf(handler)
    if (idx >= 0) {
      this.messageHandlers.splice(idx, 1)
    }
  }

  async authenticate(token: string, timeout = 15000): Promise<void> {
    if (!this.ws) throw new Error('Not connected')

    // Generate device identity if not exists
    if (!this.deviceIdentity) {
      this.deviceIdentity = await generateDeviceIdentity()
    }

    const connectId = `conn-${Date.now()}`

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeMessageHandler(handler)
        reject(new Error('Authentication timeout'))
      }, timeout)

      const handler = async (data: WebSocket.RawData) => {
        try {
          const msg: RpcResponse = JSON.parse(data.toString())

          // Handle connect.challenge event
          if (msg.type === 'ev' && msg.event === 'connect.challenge' && msg.payload) {
            const challenge = msg.payload as { nonce: string; ts: number }

            // Sign the nonce
            const signatureValue = await signWithDeviceKey(
              this.deviceIdentity!.privateKey,
              challenge.nonce
            )

            // Send signed connect frame
            const signedFrame = {
              type: 'req',
              id: `${connectId}-signed`,
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: { id: 'clawport-test', version: '0.0.1', platform: 'node', mode: 'operator' },
                device: {
                  id: this.deviceIdentity!.deviceId,
                  publicKey: this.deviceIdentity!.publicKey,
                },
                signature: {
                  nonce: challenge.nonce,
                  ts: challenge.ts,
                  value: signatureValue,
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                auth: { token },
              },
            }

            this.ws!.send(JSON.stringify(signedFrame))
            return
          }

          // Handle connect response
          if (msg.id === connectId || msg.id === `${connectId}-signed`) {
            clearTimeout(timeoutId)
            this.removeMessageHandler(handler)
            if (msg.type === 'res') {
              resolve()
            } else if (msg.type === 'err') {
              reject(new Error(msg.error?.message || 'Authentication failed'))
            }
          }
        } catch (e) {
          clearTimeout(timeoutId)
          this.removeMessageHandler(handler)
          reject(e)
        }
      }

      this.addMessageHandler(handler)

      // Send initial connect frame
      const connectFrame = {
        type: 'req',
        id: connectId,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: { id: 'clawport-test', version: '0.0.1', platform: 'node', mode: 'operator' },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          auth: { token },
        },
      }

      this.ws!.send(JSON.stringify(connectFrame))
    })
  }

  async call<T>(method: string, params: Record<string, unknown> = {}, timeout = 30000): Promise<T> {
    if (!this.ws) throw new Error('Not connected')

    const id = `rpc-${Date.now()}-${++this.requestId}`
    const request: RpcRequest = {
      type: 'req',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC call ${method} timed out`))
      }, timeout)

      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })

      this.ws!.send(JSON.stringify(request))
    })
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingRequests.clear()
    this.messageHandlers = []
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(shouldSkip)('WebSocket RPC Gateway', () => {
  let client: TestRpcClient

  beforeAll(async () => {
    if (!GATEWAY_TOKEN) {
      throw new Error('OPENCLAW_GATEWAY_TOKEN not set')
    }
    client = new TestRpcClient()
    await client.connect()
    await client.authenticate(GATEWAY_TOKEN)
  })

  afterAll(() => {
    client.disconnect()
  })

  describe('Authentication', () => {
    it('should reject invalid token', async () => {
      const badClient = new TestRpcClient()
      await badClient.connect()
      await expect(badClient.authenticate('invalid-token')).rejects.toThrow()
      badClient.disconnect()
    })
  })

  describe('cron.list', () => {
    it('should return cron jobs', async () => {
      const result = await client.call<{ jobs?: unknown[] } | unknown[]>('cron.list', {})
      expect(result).toBeDefined()
      // Result can be an array directly or wrapped in { jobs: [] }
      if (Array.isArray(result)) {
        expect(Array.isArray(result)).toBe(true)
      } else if (result && typeof result === 'object' && 'jobs' in result) {
        expect(Array.isArray(result.jobs)).toBe(true)
      }
    })

    it('should return jobs with expected fields', async () => {
      const result = await client.call<unknown[]>('cron.list', {})
      const jobs = Array.isArray(result) ? result : (result as { jobs: unknown[] }).jobs || []

      if (jobs.length > 0) {
        const job = jobs[0] as Record<string, unknown>
        // Basic fields that should exist
        expect(job).toHaveProperty('name')
        expect(typeof job.name).toBe('string')
      }
    })
  })

  describe('agents.list', () => {
    it('should return agents', async () => {
      const result = await client.call<unknown[]>('agents.list', {})
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should return agents with expected fields', async () => {
      const agents = await client.call<unknown[]>('agents.list', {})

      if (agents.length > 0) {
        const agent = agents[0] as Record<string, unknown>
        expect(agent).toHaveProperty('id')
        expect(typeof agent.id).toBe('string')
      }
    })
  })

  describe('doctor.memory.status', () => {
    it('should return memory status', async () => {
      const result = await client.call<Record<string, unknown>>('doctor.memory.status', { deep: true })
      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should have indexed field', async () => {
      const result = await client.call<Record<string, unknown>>('doctor.memory.status', { deep: true })
      expect(result).toHaveProperty('indexed')
      expect(typeof result.indexed).toBe('boolean')
    })
  })

  describe('chat.history', () => {
    it('should return chat history for a session', async () => {
      const result = await client.call<{ messages: unknown[] }>('chat.history', {
        sessionKey: 'agent:main:test',
      })
      expect(result).toBeDefined()
      expect(result).toHaveProperty('messages')
      expect(Array.isArray(result.messages)).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should return error for unknown method', async () => {
      await expect(client.call('unknown.method', {})).rejects.toThrow()
    })

    it('should return error for invalid params', async () => {
      await expect(client.call('chat.history', {})).rejects.toThrow()
    })
  })
})

// ── Connection Test (without authentication) ──────────────────────────────────

describe.skipIf(shouldSkip)('WebSocket Connection', () => {
  it('should connect to gateway', async () => {
    const ws = new WebSocket(GATEWAY_URL)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.close()
        resolve()
      })
      ws.on('error', (err) => {
        reject(new Error(`Failed to connect: ${err.message}`))
      })
    })
  })

  it('should receive error for unauthenticated request', async () => {
    const ws = new WebSocket(GATEWAY_URL)
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        // Send a request without authenticating
        ws.send(JSON.stringify({
          type: 'req',
          id: 'test-1',
          method: 'cron.list',
          params: {},
        }))
      })
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        expect(msg.type).toBe('err')
        ws.close()
        resolve()
      })
    })
  })
})