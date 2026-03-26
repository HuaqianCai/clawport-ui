/**
 * Helper functions for WebSocket authentication in tests
 */

import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519'

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

async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const keyCopy = new Uint8Array(publicKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyCopy)
  return bytesToHex(new Uint8Array(hashBuffer))
}

export async function generateDeviceIdentity() {
  const privateKey = utils.randomSecretKey()
  const publicKey = await getPublicKeyAsync(privateKey)
  const deviceId = await fingerprintPublicKey(publicKey)

  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  }
}

export async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url)
  const data = new TextEncoder().encode(payload)
  const sig = await signAsync(data, key)
  return base64UrlEncode(sig)
}

export function buildDeviceAuthPayload(params: {
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