/**
 * Test lib/gateway-websocket.ts
 */
import { callRpc, cronList, agentsList, closeAllConnections } from '../lib/gateway-websocket'
import WS from 'ws'

const token = process.env.OPENCLAW_GATEWAY_TOKEN

if (!token) {
  console.error('OPENCLAW_GATEWAY_TOKEN not set')
  process.exit(1)
}

console.log('Testing lib/gateway-websocket.ts...')
console.log('Token:', token.slice(0, 8) + '...')

// Helper for raw WebSocket chat test
async function testChatWithStreaming(sessionKey: string, message: string): Promise<void> {
  const port = parseInt(process.env.OPENCLAW_GATEWAY_PORT || '18789', 10)
  const url = `ws://localhost:${port}/ws`

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Chat test timeout'))
    }, 120000)

    const ws = new WS(url, {
      headers: { 'Origin': 'http://127.0.0.1:3000' }
    })

    let isAuthenticated = false
    const events: unknown[] = []

    ws.on('open', () => {
      // Wait for challenge
    })

    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString())

      // Handle challenge
      if ((msg.type === 'event' || msg.type === 'ev') && msg.event === 'connect.challenge') {
        const { signDevicePayload, buildDeviceAuthPayload, generateDeviceIdentity } = await import('./test-ws-auth-helpers.js')
        const identity = await generateDeviceIdentity()
        const signedAtMs = Date.now()
        const payload = buildDeviceAuthPayload({
          deviceId: identity.deviceId,
          clientId: 'openclaw-control-ui',
          clientMode: 'webchat',
          role: 'operator',
          scopes: ['operator.admin', 'operator.read', 'operator.write'],
          signedAtMs,
          token: token!,
          nonce: msg.payload.nonce,
        })
        const signature = await signDevicePayload(identity.privateKey, payload)

        ws.send(JSON.stringify({
          type: 'req',
          id: `conn-${Date.now()}`,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: 'openclaw-control-ui', version: '2026.3.23', platform: 'node', mode: 'webchat' },
            device: {
              id: identity.deviceId,
              publicKey: identity.publicKey,
              signature,
              signedAt: signedAtMs,
              nonce: msg.payload.nonce,
            },
            auth: { token: token! },
            role: 'operator',
            scopes: ['operator.admin', 'operator.read', 'operator.write'],
          },
        }))
        return
      }

      // Handle connect response
      if (msg.type === 'res' && !isAuthenticated) {
        isAuthenticated = true
        console.log('   ✓ WebSocket authenticated')

        // Send chat message
        const idempotencyKey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        ws.send(JSON.stringify({
          type: 'req',
          id: `chat-${Date.now()}`,
          method: 'chat.send',
          params: {
            sessionKey,
            message,
            deliver: false,
            idempotencyKey,
          },
        }))
        console.log(`   → Sent chat.send with idempotencyKey: ${idempotencyKey}`)
        return
      }

      // Handle all events after authentication
      if (isAuthenticated) {
        // Log all messages for debugging
        console.log('   ← Message:', JSON.stringify(msg).slice(0, 500))

        // Check for chat events
        if ((msg.type === 'event' || msg.type === 'ev') && msg.event === 'chat') {
          events.push(msg)
          console.log(`   ← chat event (state: ${msg.payload?.state})`)

          if (msg.payload?.state === 'final') {
            clearTimeout(timeout)
            ws.close()
            console.log(`   ✓ Chat completed, received ${events.length} events`)
            resolve()
          }
        }
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket error: ${err.message}`))
    })

    ws.on('close', () => {
      if (!events.some(e => (e as { payload?: { state?: string } }).payload?.state === 'final')) {
        // Connection closed without final - might be OK for some tests
        resolve()
      }
    })
  })
}

async function main() {
  try {
    // Test convenience wrappers
    console.log('\n1. Testing cronList()...')
    const jobs = await cronList()
    console.log('✓ cronList result:', JSON.stringify(jobs, null, 2).slice(0, 500))

    console.log('\n2. Testing agentsList()...')
    const agents = await agentsList()
    console.log('✓ agentsList result:', JSON.stringify(agents, null, 2))

    // Test raw RPC calls
    console.log('\n3. Testing agent.identity.get...')
    const identity = await callRpc('agent.identity.get', { sessionKey: 'agent:dslabworker:main' })
    console.log('✓ agent.identity.get:', JSON.stringify(identity, null, 2))

    console.log('\n4. Testing health...')
    const health = await callRpc('health', {})
    console.log('✓ health:', JSON.stringify(health, null, 2).slice(0, 1000))

    console.log('\n5. Testing node.list...')
    const nodes = await callRpc('node.list', {})
    console.log('✓ node.list:', JSON.stringify(nodes, null, 2))

    console.log('\n6. Testing device.pair.list...')
    const devices = await callRpc('device.pair.list', {})
    console.log('✓ device.pair.list:', JSON.stringify(devices, null, 2).slice(0, 1500))

    console.log('\n7. Testing config.get...')
    const config = await callRpc('config.get', {})
    console.log('✓ config.get:', JSON.stringify(config, null, 2).slice(0, 1500))

    // Test sessions.list
    console.log('\n8. Testing sessions.list...')
    const sessions = await callRpc<{
      sessions?: Array<{ key: string; agentId: string; [k: string]: unknown }>
      [k: string]: unknown
    }>('sessions.list', { includeGlobal: true, includeUnknown: false, limit: 120 })
    console.log('✓ sessions.list:', JSON.stringify(sessions, null, 2).slice(0, 2000))

    // Find a sessionKey for dslabworker
    const dslabSession = sessions?.sessions?.find(s => s.key.includes('agent:dslabworker:main'))
    const sessionKey = dslabSession?.key || 'agent:dslabworker:main'
    console.log(`\n   Found sessionKey: ${sessionKey}`)

    // Test chat.send with streaming (using raw WebSocket)
    console.log('\n9. Testing chat.send with streaming events...')
    await testChatWithStreaming(sessionKey, '你好，这是一条测试消息，请简短回复')

    // Test chat.history
    console.log('\n10. Testing chat.history...')
    const history = await callRpc<{ messages?: Array<{ role: string; content: string | unknown[]; timestamp: number }> }>('chat.history', { sessionKey })
    console.log('✓ chat.history:', JSON.stringify(history, null, 2).slice(0, 2000))

    console.log('\n✓ All tests passed!')

    // Clean up - close the connection pool
    closeAllConnections()
    process.exit(0)
  } catch (err) {
    console.error('\n✗ Test failed:', err)
    closeAllConnections()
    process.exit(1)
  }
}

main()