/**
 * OpenClaw gateway integration for vision (image) messages.
 *
 * The gateway's /v1/chat/completions endpoint strips image_url content parts.
 * Images work through the agent pipeline (chat.send), which is the same path
 * Discord/Telegram/etc use. We use WebSocket RPC to send, then poll chat.history.
 *
 * Flow: extract images → WebSocket chat.send → poll chat.history → extract response
 */

import type { ApiMessage, ContentPart } from './validation'
import { chatSend, chatHistory } from './gateway-websocket'

export interface OpenClawAttachment {
  mimeType: string
  content: string // base64
}

/**
 * Check if any message in the array contains image_url content parts.
 */
export function hasImageContent(messages: ApiMessage[]): boolean {
  return messages.some(m => {
    if (typeof m.content === 'string') return false
    return (m.content as ContentPart[]).some(p => p.type === 'image_url')
  })
}

/**
 * Extract all image attachments from messages in OpenClaw's format:
 * { mimeType: "image/png", content: "<base64>" }
 */
export function extractImageAttachments(messages: ApiMessage[]): OpenClawAttachment[] {
  const attachments: OpenClawAttachment[] = []

  for (const msg of messages) {
    if (typeof msg.content === 'string') continue
    for (const part of msg.content as ContentPart[]) {
      if (part.type === 'image_url') {
        const { mediaType, data } = parseDataUrl(part.image_url.url)
        attachments.push({ mimeType: mediaType, content: data })
      }
    }
  }

  return attachments
}

/**
 * Build a text prompt from the system prompt and conversation messages.
 * Extracts text from content arrays, skips system messages and image parts.
 */
export function buildTextPrompt(systemPrompt: string, messages: ApiMessage[]): string {
  const parts: string[] = []

  if (systemPrompt) {
    parts.push(systemPrompt)
  }

  for (const msg of messages) {
    if (msg.role === 'system') continue

    let text: string
    if (typeof msg.content === 'string') {
      text = msg.content
    } else {
      text = (msg.content as ContentPart[])
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n')
    }

    if (text) {
      parts.push(`${msg.role}: ${text}`)
    }
  }

  return parts.join('\n\n')
}

/**
 * Send a vision message through the OpenClaw gateway via WebSocket RPC.
 *
 * Two-step process:
 * 1. `chat.send` — fires the message (returns immediately)
 * 2. Poll `chat.history` — wait for the assistant response
 *
 * Images must be resized client-side to fit within the OS argument size limit.
 *
 * Returns the assistant's response text, or null on failure.
 */
export async function sendViaOpenClaw(opts: {
  message: string
  attachments: OpenClawAttachment[]
  sessionKey?: string
  timeoutMs?: number
}): Promise<string | null> {
  const sessionKey = opts.sessionKey || 'agent:main:clawport'
  const idempotencyKey = `clawport-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const timeoutMs = opts.timeoutMs || 60000

  // Timestamp before sending — used to identify the new response
  const sendTs = Date.now()

  // Step 1: Send the message via chat.send RPC
  try {
    const sendResult = await chatSend({
      sessionKey,
      idempotencyKey,
      message: opts.message,
      attachments: opts.attachments,
    })

    // Verify send was accepted
    if (sendResult.status !== 'started' && !sendResult.runId) {
      console.error('sendViaOpenClaw: unexpected send response:', sendResult)
      return null
    }
  } catch (err) {
    console.error('sendViaOpenClaw: chat.send error:', err)
    return null
  }

  // Step 2: Poll chat.history for the assistant response
  const pollIntervalMs = 2000
  const deadline = sendTs + timeoutMs

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollIntervalMs))

    try {
      const history = await chatHistory(sessionKey)
      const messages = history.messages || []
      if (messages.length === 0) continue

      const lastMsg = messages[messages.length - 1]

      // Wait for an assistant message that arrived after we sent
      if (lastMsg.role === 'assistant' && lastMsg.timestamp >= sendTs) {
        const content = lastMsg.content
        if (typeof content === 'string') return content
        if (Array.isArray(content)) {
          const textParts = content
            .filter((p: { type: string; text?: string }) => p.type === 'text' && p.text)
            .map((p: { text?: string }) => p.text as string)
            .join('\n')
          return textParts || null
        }
      }
    } catch {
      // Error — try again next poll
    }
  }

  console.error('sendViaOpenClaw: timed out waiting for response')
  return null
}

function parseDataUrl(url: string): { mediaType: string; data: string } {
  if (!url.startsWith('data:')) {
    return { mediaType: 'image/png', data: url }
  }

  const commaIdx = url.indexOf(',')
  if (commaIdx === -1) {
    return { mediaType: 'image/png', data: url }
  }

  const header = url.slice(5, commaIdx)
  const data = url.slice(commaIdx + 1)
  const mediaType = header.split(';')[0] || 'image/png'

  return { mediaType, data }
}
