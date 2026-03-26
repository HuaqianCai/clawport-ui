'use client'
import React, { useRef, useEffect, useMemo } from 'react'
import type { Agent } from '@/lib/types'
import { useAgentsContext } from '@/app/agents-provider'
import { AgentAvatar } from '@/components/AgentAvatar'
import { formatMessageSimple } from './Markdown'
import {
  renderContent,
  renderToolResultMessage,
  renderSubagentTaskCompletion,
  isSubagentTaskCompletion,
  parseSubagentTaskMessage,
  type MessageContent,
} from './MessageRenderer'

// Helper to extract agent ID from session key like "agent:worker_agent:subagent:uuid"
function extractAgentIdFromSessionKey(sessionKey: string): string | undefined {
  const parts = sessionKey.split(':')
  if (parts.length >= 2 && parts[0] === 'agent') {
    return parts[1] // e.g., "worker_agent"
  }
  return undefined
}

// Helper to get text content from message for comparison
function getMessageText(content: string | unknown[]): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textBlock = content.find((b: unknown) => {
      const block = b as { type?: string; text?: string }
      return block.type === 'text' && block.text
    })
    return (textBlock as { text?: string })?.text || ''
  }
  return ''
}

// Dedupe messages: remove consecutive duplicates with same role and similar content/timestamp
function dedupeMessages(messages: WsMessage[]): WsMessage[] {
  if (messages.length <= 1) return messages

  const result: WsMessage[] = []
  const timestamp = (m: WsMessage) => m.timestamp || 0

  for (let i = 0; i < messages.length; i++) {
    const current = messages[i]
    const prev = result[result.length - 1]

    if (!prev) {
      result.push(current)
      continue
    }

    // Check if this is a duplicate of the previous message
    const sameRole = current.role === prev.role
    const currentText = getMessageText(current.content)
    const prevText = getMessageText(prev.content)
    const sameContent = currentText === prevText && currentText !== ''
    const closeTimestamp = Math.abs(timestamp(current) - timestamp(prev)) < 3000 // 3 second window

    // For toolResult, also check toolName
    const sameToolName = current.toolName === prev.toolName

    // Skip if it's a duplicate
    if (sameRole && sameContent && closeTimestamp) {
      console.log('[WsMessageArea] Skipping duplicate message:', {
        role: current.role,
        content: currentText.slice(0, 30),
      })
      continue
    }

    // Skip duplicate toolResult
    if (sameRole && current.role === 'toolResult' && sameToolName && closeTimestamp) {
      console.log('[WsMessageArea] Skipping duplicate toolResult:', current.toolName)
      continue
    }

    result.push(current)
  }

  return result
}

interface WsMessage {
  id?: string
  role: 'user' | 'assistant' | 'toolResult' | 'system'
  content: string | unknown[]
  timestamp?: number
  toolName?: string
  isError?: boolean
  provenance?: {
    kind?: string
    sourceSessionKey?: string
    sourceChannel?: string
    sourceTool?: string
  }
}

interface WsMessageAreaProps {
  agent: Agent
  messages: WsMessage[]
  loading: boolean
  error: string | null
  sending: boolean
  streamingContent: string | null
}

export function WsMessageArea({ agent, messages, loading, error, sending, streamingContent }: WsMessageAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { agents } = useAgentsContext()

  // Dedupe messages before rendering
  const dedupedMessages = useMemo(() => dedupeMessages(messages), [messages])

  // Scroll to bottom on initial load and when messages change
  useEffect(() => {
    if (dedupedMessages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [dedupedMessages])

  // Scroll to bottom when streaming content updates
  useEffect(() => {
    if (streamingContent) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingContent])

  return (
    <div style={{
      flex: 1,
      overflow: 'auto',
      padding: 'var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
    }}>
      {loading && <LoadingState />}
      {error && <ErrorState error={error} />}
      {!loading && dedupedMessages.length === 0 && <EmptyState agent={agent} />}

      {dedupedMessages.map((msg, idx) => (
        <MessageBubble key={msg.id || idx} agent={agent} message={msg} agents={agents} />
      ))}

      {/* Streaming content */}
      {streamingContent && (
        <StreamingBubble agent={agent} content={streamingContent} />
      )}

      {/* Thinking indicator */}
      {sending && shouldShowThinking(dedupedMessages) && !streamingContent && (
        <ThinkingIndicator agent={agent} />
      )}

      <div ref={bottomRef} />
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────── */

function LoadingState() {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 'var(--space-4)' }}>
      Loading...
    </div>
  )
}

function ErrorState({ error }: { error: string }) {
  return (
    <div style={{
      textAlign: 'center',
      color: 'var(--system-red)',
      padding: 'var(--space-2)',
      background: 'var(--fill-tertiary)',
      borderRadius: 'var(--radius-sm)',
    }}>
      {error}
    </div>
  )
}

function EmptyState({ agent }: { agent: Agent }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 'var(--space-8)' }}>
      <div style={{ fontSize: 48, marginBottom: 'var(--space-2)' }}>{agent.emoji}</div>
      <div style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--space-1)' }}>
        Start a conversation with {agent.name}
      </div>
      <div style={{ fontSize: 'var(--text-caption1)' }}>{agent.description}</div>
    </div>
  )
}

function MessageBubble({ agent, message, agents }: { agent: Agent; message: WsMessage; agents: Agent[] }) {
  const showAvatar = message.role === 'assistant' || message.role === 'toolResult'
  const isUser = message.role === 'user'
  const isToolResult = message.role === 'toolResult'

  // Check if content is toolCall blocks (for assistant message with tool calls)
  const content = message.content
  const hasToolCalls = Array.isArray(content) && content.some((b: unknown) => {
    const block = b as { type?: string }
    return block.type === 'toolCall'
  })

  // Check if this is a subagent task completion
  const isSubagentTask = isUser && isSubagentTaskCompletion(message.provenance)

  // Find the subagent if this is a subagent task
  const subagentId = isSubagentTask && message.provenance?.sourceSessionKey
    ? extractAgentIdFromSessionKey(message.provenance.sourceSessionKey)
    : undefined
  const subagent = subagentId ? agents.find(a => a.id === subagentId) : undefined

  // Special rendering for subagent task completion
  if (isSubagentTask) {
    return renderSubagentTaskCompletion(message.content as string, subagent)
  }

  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-2)',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
    }}>
      {showAvatar && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
          <AgentAvatar agent={agent} size={28} borderRadius={7} />
          <div style={{
            fontSize: 'var(--text-caption2)',
            color: 'var(--text-tertiary)',
            maxWidth: 48,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}>
            {agent.name}
          </div>
        </div>
      )}
      <div style={{
        flex: 1,
        maxWidth: hasToolCalls ? '90%' : '75%',
        padding: isToolResult || hasToolCalls ? 0 : 'var(--space-3)',
        borderRadius: 'var(--radius-lg)',
        background: isUser ? 'var(--accent)' : (isToolResult || hasToolCalls ? 'transparent' : 'var(--fill-tertiary)'),
        color: isUser ? '#fff' : 'var(--text-primary)',
      }}>
        <div style={{ fontSize: 'var(--text-subheadline)', lineHeight: 1.5 }}>
          {isToolResult
            ? renderToolResultMessage({ content: message.content as string, toolName: message.toolName, isError: message.isError })
            : renderContent(message.content as MessageContent)
          }
        </div>
      </div>
    </div>
  )
}

function StreamingBubble({ agent, content }: { agent: Agent; content: string }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
        <AgentAvatar agent={agent} size={28} borderRadius={7} />
        <div style={{
          fontSize: 'var(--text-caption2)',
          color: 'var(--text-tertiary)',
          maxWidth: 48,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}>
          {agent.name}
        </div>
      </div>
      <div style={{
        maxWidth: '75%',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--fill-tertiary)',
        color: 'var(--text-primary)',
      }}>
        <div style={{ fontSize: 'var(--text-subheadline)', lineHeight: 1.5, color: 'var(--text-primary)' }}>
          {formatMessageSimple(content)}
          <span className="cursor-blink" style={{ opacity: 0.5 }}>▋</span>
        </div>
      </div>
    </div>
  )
}

function ThinkingIndicator({ agent }: { agent: Agent }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
        <AgentAvatar agent={agent} size={28} borderRadius={7} />
        <div style={{
          fontSize: 'var(--text-caption2)',
          color: 'var(--text-tertiary)',
          maxWidth: 48,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}>
          {agent.name}
        </div>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--fill-tertiary)',
      }}>
        <ThinkingDots />
        <span style={{ fontSize: 'var(--text-subheadline)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          Thinking...
        </span>
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 0.2, 0.4].map((delay, i) => (
        <span key={i} className="thinking-dot" style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--text-tertiary)',
          animation: `thinking-pulse 1.4s ease-in-out ${delay}s infinite`,
        }} />
      ))}
    </div>
  )
}

function shouldShowThinking(messages: WsMessage[]): boolean {
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')
  return !lastAssistantMsg?.content || typeof lastAssistantMsg.content === 'string' && !lastAssistantMsg.content.trim()
}