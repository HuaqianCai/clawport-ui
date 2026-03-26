/**
 * Test case for chat.send streaming behavior.
 *
 * This test explores:
 * 1. How chat.send returns events
 * 2. Whether there's incremental (delta) content vs full content
 * 3. The difference between "agent" stream events and "chat" events
 *
 * Key findings:
 * - "agent" events with stream: "assistant" have BOTH "text" (full) and "delta" (incremental)
 * - "chat" events with state: "delta" have FULL content each time
 * - To get incremental content, use agent stream events and read "delta" field
 *
 * Run with: npx tsx lib/chat-send.test.ts
 */

import {
  connect,
  disconnect,
  chatSend,
  chatHistory,
  subscribeChatEvents,
  subscribeAgentStream,
  ConnectionState,
  onConnectionStateChange,
  ChatEventPayload,
  AgentStreamPayload,
} from './gateway-ws-client'

// Test configuration - adjust these for your environment
const TEST_SESSION_KEY = 'agent:main:test'
const TEST_MESSAGE = '请用中文数1到10，每个数字占一行'

// Collect all events for analysis
const chatEvents: Array<{ timestamp: number; event: ChatEventPayload }> = []
const agentEvents: Array<{ timestamp: number; event: AgentStreamPayload }> = []

function logChatEvent(event: ChatEventPayload) {
  const timestamp = Date.now()
  chatEvents.push({ timestamp, event })
  const content = extractContent(event.message?.content)
  console.log(`[CHAT] state=${event.state} content_len=${content.length}`)
}

function logAgentEvent(event: AgentStreamPayload) {
  const timestamp = Date.now()
  agentEvents.push({ timestamp, event })
  if (event.stream === 'assistant') {
    console.log(`[AGENT] stream=${event.stream} text_len=${event.data.text?.length || 0} delta="${event.data.delta?.slice(0, 20) || ''}..."`)
  } else {
    console.log(`[AGENT] stream=${event.stream} data=${JSON.stringify(event.data)}`)
  }
}

function extractContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textBlock = content.find((b: { type?: string }) => b.type === 'text')
    return textBlock?.text || ''
  }
  return ''
}

async function runTest() {
  console.log('=== Chat.send Streaming Test ===\n')
  console.log('Session:', TEST_SESSION_KEY)
  console.log('Message:', TEST_MESSAGE)
  console.log('')

  // Connect to gateway
  console.log('Connecting to gateway...')
  let connected = false

  await new Promise<void>((resolve, reject) => {
    const unsubscribe = onConnectionStateChange((state: ConnectionState) => {
      console.log('Connection state:', state)
      if (state === 'connected') {
        connected = true
        unsubscribe()
        resolve()
      }
    })

    connect()

    setTimeout(() => {
      if (!connected) {
        unsubscribe()
        reject(new Error('Connection timeout after 10s'))
      }
    }, 10000)
  })

  console.log('Connected!\n')

  // Subscribe to BOTH event types
  let runId: string | null = null
  let finalReceived = false

  const unsubscribeChat = subscribeChatEvents(TEST_SESSION_KEY, (event) => {
    logChatEvent(event)
    if (event.state === 'final') {
      finalReceived = true
    }
  })

  const unsubscribeAgent = subscribeAgentStream(TEST_SESSION_KEY, logAgentEvent)

  try {
    // Send the test message
    console.log('Sending message...\n')
    const result = await chatSend({
      sessionKey: TEST_SESSION_KEY,
      message: TEST_MESSAGE,
    })

    runId = result.runId
    console.log('chat.send returned:', result)
    console.log('')

    // Wait for final event or timeout
    console.log('Waiting for response (max 60s)...\n')

    const startTime = Date.now()
    const timeout = 60000

    while (!finalReceived && Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, 500))
    }

    if (finalReceived) {
      console.log('\n=== Response completed! ===\n')
    } else {
      console.log('\n=== Timeout waiting for response ===\n')
    }

  } finally {
    unsubscribeChat()
    unsubscribeAgent()
    await disconnect()
  }

  // Analysis
  console.log('\n=== Analysis ===\n')

  console.log('--- CHAT Events (state: delta) ---')
  const deltaChatEvents = chatEvents.filter(e => e.event.state === 'delta')
  console.log('Delta events count:', deltaChatEvents.length)

  if (deltaChatEvents.length > 1) {
    console.log('\nContent in each delta event:')
    deltaChatEvents.forEach((e, i) => {
      const content = extractContent(e.event.message?.content)
      console.log(`  [${i}] len=${content.length} content="${content.slice(0, 50)}..."`)
    })

    // Check if content is cumulative (full each time) or incremental
    const contents = deltaChatEvents.map(e => extractContent(e.event.message?.content))
    let isCumulative = true
    for (let i = 1; i < contents.length; i++) {
      if (!contents[i].startsWith(contents[i - 1])) {
        isCumulative = false
        break
      }
    }
    console.log('\nConclusion: CHAT delta events contain', isCumulative ? 'CUMULATIVE (full) content' : 'MIXED content')
  }

  console.log('\n--- AGENT Events (stream: assistant) ---')
  const assistantEvents = agentEvents.filter(e => e.event.stream === 'assistant')
  console.log('Assistant stream events count:', assistantEvents.length)

  if (assistantEvents.length > 0) {
    console.log('\nDelta field in each assistant event:')
    assistantEvents.forEach((e, i) => {
      const delta = e.event.data.delta || ''
      const text = e.event.data.text || ''
      console.log(`  [${i}] text_len=${text.length} delta="${delta.slice(0, 30)}..."`)
    })

    // Reconstruct text from deltas
    const allDeltas = assistantEvents.map(e => e.event.data.delta || '').join('')
    const lastText = assistantEvents[assistantEvents.length - 1]?.event.data.text || ''
    console.log('\nReconstructed from deltas:', allDeltas.length, 'chars')
    console.log('Last text field:', lastText.length, 'chars')
    console.log('Match:', allDeltas === lastText ? 'YES (delta concatenation equals final text)' : 'NO')
  }

  console.log('\n--- Summary ---')
  console.log('Total chat events:', chatEvents.length)
  console.log('Total agent events:', agentEvents.length)
  console.log('')

  if (assistantEvents.length > 0) {
    console.log('✓ AGENT events with stream="assistant" provide INCREMENTAL content via "delta" field')
    console.log('✓ Each AGENT event has both "text" (full so far) and "delta" (incremental)')
  }

  if (deltaChatEvents.length > 0) {
    console.log('⚠ CHAT events with state="delta" contain FULL content each time')
    console.log('⚠ Use AGENT events if you need incremental streaming')
  }
}

// Run the test
runTest().catch(console.error)