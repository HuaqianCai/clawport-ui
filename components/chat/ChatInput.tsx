'use client'
import React, { useRef } from 'react'
import type { Agent } from '@/lib/types'
import type { MediaAttachment } from '@/lib/conversations'
import type { SlashCommand } from '@/lib/slash-commands'
import { isSlashInput, matchCommands } from '@/lib/slash-commands'
import { fileToAttachment } from './MediaUtils'
import { MediaPreview } from './MediaPreview'
import { SlashCommandMenu } from './SlashCommandMenu'

interface ChatInputProps {
  agent: Agent
  input: string
  setInput: (v: string) => void
  isStreaming: boolean
  pendingAttachments: MediaAttachment[]
  setPendingAttachments: (v: MediaAttachment[]) => void
  slashMatches: SlashCommand[]
  setSlashMatches: (v: SlashCommand[]) => void
  slashIndex: number
  setSlashIndex: (v: number) => void
  onSend: () => void
  onSlashSelect: (cmd: SlashCommand) => void
}

export function ChatInput({
  agent,
  input,
  setInput,
  isStreaming,
  pendingAttachments,
  setPendingAttachments,
  slashMatches,
  setSlashMatches,
  slashIndex,
  setSlashIndex,
  onSend,
  onSlashSelect,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const slashMenuOpen = slashMatches.length > 0
  const hasContent = input.trim().length > 0 || pendingAttachments.length > 0

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((slashIndex + 1) % slashMatches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((slashIndex - 1 + slashMatches.length) % slashMatches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        onSlashSelect(slashMatches[slashIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashMatches([])
        return
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      textareaRef.current?.blur()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newAttachments: MediaAttachment[] = []
    for (let i = 0; i < files.length; i++) {
      newAttachments.push(await fileToAttachment(files[i]))
    }
    setPendingAttachments([...pendingAttachments, ...newAttachments])
    e.target.value = ''
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (file) {
          const att = await fileToAttachment(file)
          setPendingAttachments([...pendingAttachments, att])
        }
        return
      }
    }
  }

  function removePendingAttachment(index: number) {
    setPendingAttachments(pendingAttachments.filter((_, i) => i !== index))
  }

  return (
    <div style={{
      padding: 'var(--space-3) var(--space-4)',
      borderTop: '1px solid var(--separator)',
      background: 'var(--material-regular)',
      flexShrink: 0,
    }}>
      {/* Slash command autocomplete dropdown */}
      {slashMenuOpen && (
        <SlashCommandMenu
          commands={slashMatches}
          selectedIndex={slashIndex}
          onSelect={onSlashSelect}
          onHover={setSlashIndex}
        />
      )}

      {/* Pending attachments preview */}
      {pendingAttachments.length > 0 && (
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <MediaPreview
            attachments={pendingAttachments}
            onRemove={removePendingAttachment}
          />
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 'var(--space-2)',
        background: 'var(--fill-secondary)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-2) var(--space-3)',
        border: '1px solid var(--separator)',
      }}>
        {/* Attach button */}
        <button
          className="btn-ghost focus-ring"
          aria-label="Attach file"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: 'var(--space-1)',
            flexShrink: 0,
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,.zip"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileAttach}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => {
            const val = e.target.value
            setInput(val)
            if (isSlashInput(val) && !val.includes(' ')) {
              const matches = matchCommands(val)
              setSlashMatches(matches)
              setSlashIndex(0)
            } else {
              setSlashMatches([])
            }
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={`Message ${agent.name}...`}
          rows={1}
          disabled={isStreaming}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-subheadline)',
            lineHeight: 'var(--leading-normal)',
            maxHeight: 120,
            minHeight: 24,
            padding: '2px 0',
            opacity: isStreaming ? 0.5 : 1,
          }}
          onInput={e => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = 'auto'
            target.style.height = Math.min(target.scrollHeight, 120) + 'px'
          }}
        />

        {/* Send button */}
        <button
          className="focus-ring"
          onClick={() => onSend()}
          disabled={!hasContent || isStreaming}
          aria-label="Send message"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: hasContent ? 'var(--accent)' : 'var(--fill-tertiary)',
            color: hasContent ? '#000' : 'var(--text-quaternary)',
            border: 'none',
            cursor: hasContent ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 'var(--weight-bold)',
            transition: 'all 150ms var(--ease-smooth)',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>

      {/* Hint */}
      <div style={{
        fontSize: 'var(--text-caption2)',
        color: 'var(--text-quaternary)',
        textAlign: 'center',
        marginTop: 'var(--space-1)',
      }}>
        Enter to send &middot; Shift+Enter for newline &middot; / for commands
      </div>
    </div>
  )
}