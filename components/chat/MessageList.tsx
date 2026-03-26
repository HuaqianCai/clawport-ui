'use client'
import React, { useRef, useEffect } from 'react'
import type { Agent } from '@/lib/types'
import type { Message } from '@/lib/conversations'
import { parseMedia } from '@/lib/conversations'
import { AgentAvatar } from '@/components/AgentAvatar'
import { formatMessage } from './Markdown'
import { formatTimestamp, shouldShowTimestamp, shouldShowAvatar } from './MessageUtils'
import { renderMedia } from './MediaUtils'

interface MessageListProps {
  agent: Agent
  messages: Message[]
  isStreaming: boolean
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

export function MessageList({
  agent,
  messages,
  isStreaming,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: MessageListProps) {
  const messagesAreaRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on initial load and when messages change
  useEffect(() => {
    if (messages.length > 0) {
      // Use immediate scroll on initial load, smooth for updates
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [messages])

  return (
    <div
      ref={messagesAreaRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--bg)',
        padding: 'var(--space-5) 0 var(--space-16) 0',
        position: 'relative',
      }}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--accent-fill)',
          border: '2px dashed var(--accent)',
          borderRadius: 'var(--radius-md)',
          margin: 'var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5,
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 'var(--text-subheadline)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--accent)',
          }}>
            Drop files to attach
          </div>
        </div>
      )}

      {messages.map((msg, i) => {
        const isUser = msg.role === 'user'
        const showAvatar: boolean = shouldShowAvatar(messages, i)
        const showTimestamp: boolean = shouldShowTimestamp(messages, i)
        const isSystem = msg.role === 'system'
        const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1 && (isStreaming || !!msg.isStreaming)
        const showTypingDots: boolean = isLastAssistant && !msg.content
        const media = isSystem ? [] : (msg.media || parseMedia(msg.content))

        // Strip media URLs from text for display
        let textContent = msg.content
        if (!isSystem && media.length > 0 && !msg.media) {
          media.forEach(m => {
            textContent = textContent.replace(m.url, '')
            textContent = textContent.replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
          })
          textContent = textContent.trim()
        }
        // Hide auto-generated content labels for media-only messages
        if (!isSystem && msg.media && msg.media.length > 0) {
          const isAutoLabel = textContent.startsWith('[') && textContent.endsWith(']')
          if (isAutoLabel) textContent = ''
        }

        return (
          <div key={msg.id || i} className="animate-fade-in">
            {/* Timestamp divider */}
            {showTimestamp && (
              <div style={{
                textAlign: 'center',
                padding: 'var(--space-3) 0',
                fontSize: 'var(--text-caption2)',
                color: 'var(--text-tertiary)',
              }}>
                {formatTimestamp(msg.timestamp)}
              </div>
            )}

            {/* Spacing between role switches */}
            {!showTimestamp && i > 0 && msg.role !== 'system' && (() => {
              let prev = i - 1
              while (prev >= 0 && messages[prev].role === 'system') prev--
              const prevRole = prev >= 0 ? messages[prev].role : msg.role
              return <div style={{ height: prevRole !== msg.role ? 'var(--space-4)' : 'var(--space-1)' }} />
            })()}

            {/* User message */}
            {isUser && (
              <UserMessage textContent={textContent} media={media} />
            )}

            {/* System message */}
            {isSystem && (
              <SystemMessage content={msg.content} />
            )}

            {/* Assistant message */}
            {msg.role === 'assistant' && (
              <AssistantMessage
                agent={agent}
                textContent={textContent}
                media={media}
                showAvatar={showAvatar}
                showTypingDots={showTypingDots}
                isLastAssistant={isLastAssistant}
              />
            )}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

/* ── Message sub-components ───────────────────────────────────── */

function UserMessage({ textContent, media }: { textContent: string; media: ReturnType<typeof parseMedia> }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      padding: '0 var(--space-4)',
      marginBottom: 'var(--space-1)',
    }}>
      {textContent && (
        <div className="msg-user" style={{
          maxWidth: '75%',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)',
          background: 'var(--accent)',
          color: 'var(--accent-contrast)',
          fontSize: 'var(--text-subheadline)',
          lineHeight: 'var(--leading-relaxed)',
          fontWeight: 'var(--weight-medium)',
          boxShadow: 'var(--shadow-subtle)',
        }}>
          {textContent}
        </div>
      )}
      {media.length > 0 && (
        <div style={{ maxWidth: '75%' }}>
          {renderMedia(media, true)}
        </div>
      )}
    </div>
  )
}

function SystemMessage({ content }: { content: string }) {
  return (
    <div style={{
      padding: '0 var(--space-4)',
      marginBottom: 'var(--space-1)',
    }}>
      <div style={{
        maxWidth: '85%',
        margin: '0 auto',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--fill-tertiary)',
        borderLeft: '3px solid var(--accent)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--text-footnote)',
        lineHeight: 'var(--leading-relaxed)',
      }}>
        {formatMessage(content)}
      </div>
    </div>
  )
}

function AssistantMessage({
  agent,
  textContent,
  media,
  showAvatar,
  showTypingDots,
  isLastAssistant,
}: {
  agent: Agent
  textContent: string
  media: ReturnType<typeof parseMedia>
  showAvatar: boolean
  showTypingDots: boolean
  isLastAssistant: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-start',
      padding: '0 var(--space-4)',
      marginBottom: 'var(--space-1)',
    }}>
      <div style={{
        flexShrink: 0,
        width: 28,
        marginRight: 'var(--space-2)',
      }}>
        {showAvatar ? (
          <AgentAvatar agent={agent} size={28} borderRadius={14} />
        ) : <div style={{ width: 28 }} />}
      </div>

      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column' }}>
        {/* Typing indicator */}
        {showTypingDots && (
          <div className="msg-assistant" style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
            background: 'var(--material-thin)',
            border: '1px solid var(--separator)',
          }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 16 }}>
              <span className="typing-dot" style={{ animationDelay: '0ms' }} />
              <span className="typing-dot" style={{ animationDelay: '150ms' }} />
              <span className="typing-dot" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Text bubble */}
        {textContent && (
          <div className="msg-assistant" style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
            background: 'var(--material-thin)',
            border: '1px solid var(--separator)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-subheadline)',
            lineHeight: 'var(--leading-relaxed)',
          }}>
            {formatMessage(textContent)}
            {/* Streaming cursor */}
            {isLastAssistant && textContent && (
              <span style={{
                display: 'inline-block',
                width: 2,
                height: '1.1em',
                background: 'var(--accent)',
                marginLeft: 2,
                animation: 'blink-cursor 1s step-end infinite',
                verticalAlign: 'text-bottom',
              }} />
            )}
          </div>
        )}

        {/* Media attachments */}
        {media.length > 0 && renderMedia(media, false)}
      </div>
    </div>
  )
}