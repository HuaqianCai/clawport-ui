'use client'
import React, { useRef, useCallback } from 'react'
import type { Agent } from '@/lib/types'
import type { SlashCommand } from '@/lib/slash-commands'

interface WsInputAreaProps {
  agent: Agent
  input: string
  setInput: (v: string) => void
  sending: boolean
  showCommands: boolean
  matchedCommands: SlashCommand[]
  selectedCommandIndex: number
  onSend: () => void
  onAbort: () => void
  onCommandSelect: (cmd: SlashCommand) => void
  setSelectedCommandIndex: (i: number) => void
  setShowCommands: (v: boolean) => void
}

export function WsInputArea({
  agent,
  input,
  setInput,
  sending,
  showCommands,
  matchedCommands,
  selectedCommandIndex,
  onSend,
  onAbort,
  onCommandSelect,
  setSelectedCommandIndex,
  setShowCommands,
}: WsInputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasContent = input.trim().length > 0

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands && matchedCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCommandIndex((selectedCommandIndex + 1) % matchedCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCommandIndex((selectedCommandIndex - 1 + matchedCommands.length) % matchedCommands.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const selected = matchedCommands[selectedCommandIndex]
        if (selected) {
          setInput(selected.name + ' ')
          setShowCommands(false)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowCommands(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
    if (e.key === 'Escape' && sending) {
      e.preventDefault()
      onAbort()
    }
  }, [showCommands, matchedCommands, selectedCommandIndex, setSelectedCommandIndex, setInput, setShowCommands, onSend, sending, onAbort])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }, [setInput])

  return (
    <div style={{
      padding: 'var(--space-3) var(--space-4)',
      borderTop: '1px solid var(--separator)',
      background: 'var(--material-thick)',
      flexShrink: 0,
    }}>
      {/* Command suggestions */}
      {showCommands && matchedCommands.length > 0 && (
        <CommandMenu
          commands={matchedCommands}
          selectedIndex={selectedCommandIndex}
          onSelect={onCommandSelect}
          onHover={setSelectedCommandIndex}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={sending ? 'Waiting for response...' : `Message ${agent.name}...`}
          disabled={sending}
          rows={1}
          style={{
            flex: 1,
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--separator)',
            background: 'var(--bg)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-subheadline)',
            resize: 'none',
            outline: 'none',
            maxHeight: 200,
            fontFamily: 'inherit',
          }}
        />
        {sending ? (
          <StopButton onClick={onAbort} />
        ) : (
          <SendButton disabled={!hasContent} onClick={onSend} />
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────── */

function CommandMenu({
  commands,
  selectedIndex,
  onSelect,
  onHover,
}: {
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
  onHover: (index: number) => void
}) {
  return (
    <div style={{
      marginBottom: 'var(--space-2)',
      background: 'var(--fill-secondary)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      {commands.map((cmd, idx) => (
        <div
          key={cmd.name}
          onClick={() => onSelect(cmd)}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            cursor: 'pointer',
            background: idx === selectedIndex ? 'var(--fill-tertiary)' : 'transparent',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--accent)' }}>
            {cmd.name}
          </span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption1)' }}>
            {cmd.description}
          </span>
        </div>
      ))}
    </div>
  )
}

function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        border: 'none',
        background: 'var(--system-red)',
        color: 'white',
        fontWeight: 'var(--weight-semibold)',
        cursor: 'pointer',
        fontSize: 'var(--text-subheadline)',
      }}
    >
      Stop
    </button>
  )
}

function SendButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        border: 'none',
        background: disabled ? 'var(--fill-tertiary)' : 'var(--accent)',
        color: disabled ? 'var(--text-tertiary)' : 'var(--accent-contrast)',
        fontWeight: 'var(--weight-semibold)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 'var(--text-subheadline)',
        transition: 'all 150ms',
      }}
    >
      Send
    </button>
  )
}