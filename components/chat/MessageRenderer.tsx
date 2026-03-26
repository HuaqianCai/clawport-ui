'use client'
import React from 'react'
import type { Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/AgentAvatar'
import { formatMessageSimple } from './Markdown'

/* ── Content types ─────────────────────────────────────────────────── */

export interface TextBlock { type: 'text'; text: string }
export interface ToolCallBlock { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
export interface ToolResultBlock { type: 'toolResult'; toolCallId: string; toolName: string; content: Array<{ type: string; text?: string }>; isError?: boolean }
export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock | { type: string; [key: string]: unknown }
export type MessageContent = string | ContentBlock[]

/* ── Subagent task completion detection ─────────────────────────────── */

export interface MessageProvenance {
  kind?: string
  sourceSessionKey?: string
  sourceChannel?: string
  sourceTool?: string
}

export function isSubagentTaskCompletion(provenance?: MessageProvenance): boolean {
  return provenance?.sourceTool === 'subagent_announce'
}

export function parseSubagentTaskMessage(content: MessageContent): {
  task: string
  status: string
  runtime?: string
  resultText: string
} | null {
  const text = extractTextFromContent(content)
  if (!text) return null

  // Parse task name
  const taskMatch = text.match(/task:\s*(.+?)\n/)
  const task = taskMatch ? taskMatch[1].trim() : ''

  // Parse status
  const statusMatch = text.match(/status:\s*(.+?)\n/)
  const status = statusMatch ? statusMatch[1].trim() : ''

  // Parse runtime
  const runtimeMatch = text.match(/Stats:\s*runtime\s+(.+?)\s/)
  const runtime = runtimeMatch ? runtimeMatch[1].trim() : undefined

  // Extract result content between markers
  const resultMatch = text.match(/<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>([\s\S]*?)<<<END_UNTRUSTED_CHILD_RESULT>>>/)
  const resultText = resultMatch ? resultMatch[1].trim() : ''

  return { task, status, runtime, resultText }
}

/* ── Content extraction ───────────────────────────────────────────── */

export function extractTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textBlock = content.find(b => b.type === 'text' && 'text' in b && b.text)
    return textBlock && 'text' in textBlock ? String(textBlock.text) : ''
  }
  return ''
}

/* ── Tool result message rendering ─────────────────────────────────── */

export interface ToolResultMessage {
  content: MessageContent
  toolName?: string
  isError?: boolean
}

export function renderToolResultMessage(msg: ToolResultMessage): React.ReactNode {
  const toolName = msg.toolName || 'result'
  const isError = msg.isError || false

  // Extract result text from content
  let resultText = ''
  if (typeof msg.content === 'string') {
    resultText = msg.content
  } else if (Array.isArray(msg.content)) {
    resultText = msg.content.map(c => 'text' in c && c.text ? c.text : '').join('')
  }

  return (
    <div style={{
      background: isError ? 'rgba(255,0,0,0.05)' : 'var(--fill-secondary)',
      padding: 'var(--space-2) var(--space-3)',
      borderRadius: 'var(--radius-sm)',
      fontSize: 'var(--text-caption1)',
      fontFamily: 'var(--font-mono)',
      borderLeft: `3px solid ${isError ? 'var(--system-red)' : 'var(--system-green)'}`,
    }}>
      <div style={{ color: 'var(--accent)', marginBottom: 'var(--space-1)' }}>
        {toolName}
      </div>
      <pre style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'var(--text-primary)',
        maxHeight: 200,
        overflow: 'auto',
      }}>
        {resultText.slice(0, 1000)}{resultText.length > 1000 ? '\n... (truncated)' : ''}
      </pre>
    </div>
  )
}

/* ── Message content rendering ─────────────────────────────────────── */

export function renderContent(content: MessageContent): React.ReactNode {
  if (typeof content === 'string') {
    return formatMessageSimple(content)
  }

  if (Array.isArray(content)) {
    return (
      <>
        {content.map((block, idx) => {
          if (block.type === 'text' && 'text' in block && block.text) {
            return <span key={idx}>{formatMessageSimple(String(block.text))}</span>
          }
          if (block.type === 'toolCall') {
            const tc = block as ToolCallBlock
            return (
              <div key={idx} style={{
                background: 'var(--fill-secondary)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-1)',
                fontSize: 'var(--text-caption1)',
                fontFamily: 'var(--font-mono)',
              }}>
                <span style={{ color: 'var(--accent)' }}> {tc.name}</span>
                {tc.arguments && (
                  <span style={{ color: 'var(--text-tertiary)', marginLeft: 'var(--space-2)' }}>
                    {JSON.stringify(tc.arguments)}
                  </span>
                )}
              </div>
            )
          }
          if (block.type === 'toolResult') {
            const tr = block as ToolResultBlock
            const resultText = tr.content?.map(c => 'text' in c ? c.text : '').join('') || ''
            return (
              <div key={idx} style={{
                background: tr.isError ? 'var(--system-red-bg, rgba(255,0,0,0.1))' : 'var(--fill-tertiary)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-1)',
                fontSize: 'var(--text-caption1)',
                fontFamily: 'var(--font-mono)',
                borderLeft: `3px solid ${tr.isError ? 'var(--system-red)' : 'var(--system-green)'}`,
              }}>
                <div style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>
                  {tr.isError ? '' : ''} {tr.toolName}
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {resultText.slice(0, 500)}{resultText.length > 500 ? '...' : ''}
                </pre>
              </div>
            )
          }
          // Unknown block type - try to extract text
          if ('text' in block && typeof block.text === 'string') {
            return <span key={idx}>{block.text}</span>
          }
          return null
        })}
      </>
    )
  }

  return null
}

/* ── Subagent Task Completion Rendering ─────────────────────────────── */

export function renderSubagentTaskCompletion(content: MessageContent, subagent?: Agent): React.ReactNode {
  const parsed = parseSubagentTaskMessage(content)
  if (!parsed) return null

  const { task, status, runtime, resultText } = parsed
  const isSuccess = status.includes('success') || status.includes('completed')
  const bgColor = isSuccess ? 'rgba(52, 199, 89, 0.08)' : 'var(--fill-tertiary)'
  const borderColor = isSuccess ? 'rgba(52, 199, 89, 0.3)' : 'var(--separator)'
  const headerBg = isSuccess ? 'rgba(52, 199, 89, 0.12)' : 'var(--fill-secondary)'

  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-2)',
      alignItems: 'flex-start',
    }}>
      {/* Subagent avatar and name on left */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
        {subagent ? (
          <AgentAvatar agent={subagent} size={28} borderRadius={7} />
        ) : (
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: isSuccess ? 'var(--system-green)' : 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14,
            fontWeight: 'var(--weight-bold)',
          }}>
            {isSuccess ? '✓' : '○'}
          </div>
        )}
        {subagent && (
          <div style={{
            fontSize: 'var(--text-caption2)',
            color: 'var(--text-tertiary)',
            maxWidth: 48,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}>
            {subagent.name}
          </div>
        )}
      </div>
      {/* Message bubble on right */}
      <div style={{
        flex: 1,
        maxWidth: '75%',
        borderRadius: 'var(--radius-lg)',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        overflow: 'hidden',
      }}>
        {/* Header with task name and runtime */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          background: headerBg,
          borderBottom: `1px solid ${borderColor}`,
        }}>
          <div style={{ flex: 1, fontSize: 'var(--text-subheadline)', fontWeight: 'var(--weight-medium)' }}>
            {task || 'Subagent Task'}
          </div>
          {runtime && (
            <div style={{
              fontSize: 'var(--text-caption1)',
              color: 'var(--text-tertiary)',
              background: 'var(--fill-tertiary)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
            }}>
              {runtime}
            </div>
          )}
        </div>
        {/* Status line */}
        <div style={{
          padding: 'var(--space-1) var(--space-3)',
          fontSize: 'var(--text-caption2)',
          background: 'var(--fill-tertiary)',
        }}>
          <span style={{ color: isSuccess ? 'var(--system-green)' : 'var(--text-secondary)' }}>
            {status}
          </span>
        </div>
        {/* Result content */}
        {resultText && (
          <div style={{
            padding: 'var(--space-3)',
            fontSize: 'var(--text-footnote)',
            lineHeight: 1.6,
            maxHeight: 300,
            overflow: 'auto',
            borderTop: '1px solid var(--separator)',
          }}>
            {formatMessageSimple(resultText)}
          </div>
        )}
      </div>
    </div>
  )
}