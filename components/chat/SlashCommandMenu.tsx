'use client'
import type { SlashCommand } from '@/lib/slash-commands'

interface SlashCommandMenuProps {
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
  onHover: (index: number) => void
}

export function SlashCommandMenu({ commands, selectedIndex, onSelect, onHover }: SlashCommandMenuProps) {
  return (
    <div
      className="animate-slide-down"
      style={{
        marginBottom: 'var(--space-2)',
        background: 'var(--material-thick)',
        border: '1px solid var(--separator)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-overlay)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflow: 'hidden',
      }}
    >
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          onMouseDown={e => {
            e.preventDefault()
            onSelect(cmd)
          }}
          onMouseEnter={() => onHover(i)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            width: '100%',
            padding: 'var(--space-2) var(--space-3)',
            background: i === selectedIndex ? 'var(--fill-secondary)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-subheadline)',
            transition: 'background 100ms',
          }}
        >
          <span style={{
            color: 'var(--accent)',
            fontWeight: 'var(--weight-semibold)',
            fontFamily: '"SF Mono", Menlo, monospace',
            fontSize: 'var(--text-footnote)',
            minWidth: 60,
          }}>
            {cmd.name}
          </span>
          <span style={{
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-caption1)',
          }}>
            {cmd.description}
          </span>
        </button>
      ))}
    </div>
  )
}