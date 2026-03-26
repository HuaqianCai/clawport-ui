/**
 * Debug script for WebSocket RPC authentication flow
 * Run: npx tsx scripts/test-ws-auth.ts
 */

import WebSocket from 'ws'
import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519'

const GATEWAY_URL = process.env.GATEWAY_WS_URL || 'ws://localhost:18789/ws'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ''

console.log('Connecting to:', GATEWAY_URL)
console.log('Token:', GATEWAY_TOKEN ? `${GATEWAY_TOKEN.slice(0, 8)}...` : '(not set)')

// Crypto helpers
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
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKey.buffer)
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

async function main() {
  const deviceIdentity = await generateDeviceIdentity()
  console.log('Device ID:', deviceIdentity.deviceId.slice(0, 16) + '...')
  console.log('Public Key:', deviceIdentity.publicKey.slice(0, 20) + '...')

  const ws = new WebSocket(GATEWAY_URL, {
    headers: {
      'Origin': 'http://127.0.0.1:18789',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
  })
  let requestId = 1

  ws.on('open', async () => {
    console.log('✓ Connected, waiting for challenge...')
    // Don't send anything - wait for the gateway to send challenge event
  })

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString())
    console.log('\n← Received:', JSON.stringify(msg, null, 2).slice(0, 500))

    // Handle connect.challenge event (type can be "event" or "ev")
    if ((msg.type === 'ev' || msg.type === 'event') && msg.event === 'connect.challenge' && msg.payload) {
      console.log('\n! Received connect.challenge, signing...')
      const challenge = msg.payload

      // Build auth payload for signing (v2 format)
      const signedAtMs = Date.now()
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId: 'openclaw-control-ui',
        clientMode: 'webchat',
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write'],
        signedAtMs,
        token: GATEWAY_TOKEN,
        nonce: challenge.nonce,
      })

      console.log('\n Signing payload:', payload)

      // Sign the payload string directly
      const signature = await signDevicePayload(deviceIdentity.privateKey, payload)
      console.log('Signature:', signature.slice(0, 40) + '...')

      // Send signed connect frame
      const signedFrame = {
        type: 'req',
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'openclaw-control-ui',
            version: '2026.3.23',
            platform: 'node',
            mode: 'webchat',
            instanceId: Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18),
          },
          role: 'operator',
          scopes: ['operator.admin', 'operator.read', 'operator.write'],
          device: {
            id: deviceIdentity.deviceId,
            publicKey: deviceIdentity.publicKey,
            signature,
            signedAt: signedAtMs,
            nonce: challenge.nonce,
          },
          caps: ['tool-events'],
          auth: {
            token: GATEWAY_TOKEN,
            deviceToken: GATEWAY_TOKEN,
          },
          userAgent: 'ClawPort/0.8.5',
          locale: 'zh-CN',
        },
      }

      console.log('\n→ Sending signed connect frame')
      console.log(JSON.stringify(signedFrame, null, 2))
      ws.send(JSON.stringify(signedFrame))
      return
    }

    // Handle connect response
    if (msg.id && msg.id.includes('-')) {
      if (msg.type === 'res') {
        if (msg.ok === false) {
          console.log('\n! Connect rejected:', msg.error?.message?.slice(0, 80))
          return
        }
        console.log('\n✓ Authenticated!')

        // Now test cron.list
        const req = {
          type: 'req',
          id: `rpc-${requestId++}`,
          method: 'cron.list',
          params: {},
        }
        console.log('\n→ Calling cron.list')
        ws.send(JSON.stringify(req))
      } else if (msg.type === 'err') {
        console.log('\n✗ Authentication failed:', msg.error)
        ws.close()
        process.exit(1)
      }
      return
    }

    // Handle RPC response
    if (msg.type === 'res' && msg.id?.startsWith('rpc-')) {
      console.log('\n✓ cron.list result:', JSON.stringify(msg.result, null, 2).slice(0, 500))
      ws.close()
      process.exit(0)
    } else if (msg.type === 'err' && msg.id?.startsWith('rpc-')) {
      console.log('\n✗ RPC error:', msg.error)
      ws.close()
      process.exit(1)
    }
  })

  ws.on('error', (err) => {
    console.error('\n✗ WebSocket error:', err.message)
  })

  ws.on('close', (code, reason) => {
    console.log(`\n\nConnection closed: code=${code}, reason=${reason.toString() || '(none)'}`)
  })

  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('\n\nTimeout after 30s, closing...')
    ws.close()
    process.exit(0)
  }, 30000)
}

main().catch(console.error)