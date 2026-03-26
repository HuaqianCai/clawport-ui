'use client'
import { useRouter } from 'next/navigation'
import type { Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/AgentAvatar'

interface ChatHeaderProps {
  agent: Agent
  messagesCount: number
  onBack?: () => void
  onClear: () => void
}

export function ChatHeader({ agent, messagesCount, onBack, onClear }: ChatHeaderProps) {
  const router = useRouter()

  return (
    <div style={{
      height: 52,
      display: 'flex',
      alignItems: 'center',
      padding: '0 var(--space-4)',
      borderBottom: '1px solid var(--separator)',
      background: 'var(--material-thick)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      flexShrink: 0,
    }}>
      {/* Mobile back button */}
      {onBack && (
        <button
          className="md:hidden btn-ghost focus-ring"
          onClick={onBack}
          aria-label="Back to agents"
          style={{
            padding: 'var(--space-1) var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            marginRight: 'var(--space-2)',
            fontSize: 'var(--text-subheadline)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
      )}

      {/* Agent info */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        flex: 1,
        minWidth: 0,
      }}>
        <AgentAvatar agent={agent} size={32} borderRadius={16} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--text-subheadline)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)',
            letterSpacing: '-0.2px',
            lineHeight: 1.2,
          }}>
            {agent.name}
          </div>
          <div style={{
            fontSize: 'var(--text-caption2)',
            color: 'var(--text-tertiary)',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {agent.title}{agent.model && ` · ${agent.model.split('/').pop()}`}{messagesCount > 1 && ' · Synced'}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <button
          className="btn-ghost focus-ring"
          aria-label="View agent profile"
          onClick={() => router.push(`/agents/${agent.id}`)}
          style={{
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
        <button
          className="btn-ghost focus-ring"
          aria-label="Clear conversation"
          onClick={onClear}
          style={{
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  )
}