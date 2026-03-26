'use client'
import type { Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/AgentAvatar'

interface WsChatHeaderProps {
  agent: Agent
  onBack?: () => void
  models: Array<{ id: string; name?: string }>
  currentModel: string
  onModelChange: (model: string) => void
}

export function WsChatHeader({ agent, onBack, models, currentModel, onModelChange }: WsChatHeaderProps) {
  return (
    <div style={{
      height: 52,
      display: 'flex',
      alignItems: 'center',
      padding: '0 var(--space-4)',
      borderBottom: '1px solid var(--separator)',
      background: 'var(--material-thick)',
      backdropFilter: 'blur(20px)',
      flexShrink: 0,
    }}>
      {onBack && (
        <button
          className="md:hidden focus-ring"
          onClick={onBack}
          aria-label="Back"
          style={{
            padding: 'var(--space-1) var(--space-2)',
            marginRight: 'var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      <AgentAvatar agent={agent} size={32} borderRadius={8} />
      <div style={{ marginLeft: 'var(--space-3)', flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 'var(--weight-semibold)',
          fontSize: 'var(--text-subheadline)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {agent.name}
        </div>
        <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--text-secondary)' }}>
          {agent.title}
        </div>
      </div>

      {/* Model selector */}
      {models.length > 0 && (
        <select
          value={currentModel}
          onChange={(e) => onModelChange(e.target.value)}
          style={{
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--separator)',
            background: 'var(--fill-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-caption1)',
            cursor: 'pointer',
          }}
        >
          {models.map(model => (
            <option key={model.id} value={model.id}>
              {model.name || model.id}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}