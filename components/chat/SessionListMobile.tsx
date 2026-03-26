'use client'
import type { SessionInfo } from '@/lib/gateway-ws-client'
import type { Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/AgentAvatar'

interface SessionListMobileProps {
  agent: Agent
  sessions: SessionInfo[]
  activeSessionKey: string | null
  onSelect: (sessionKey: string) => void
  onNewSession: () => void
  onDeleteSession: (sessionKey: string) => void
  onBack: () => void
  loading?: boolean
}

export function SessionListMobile({
  agent,
  sessions,
  activeSessionKey,
  onSelect,
  onNewSession,
  onDeleteSession,
  onBack,
  loading,
}: SessionListMobileProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
    }}>
      {/* Header with back button */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--separator)',
        background: 'var(--material-thick)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
      }}>
        <BackButton onClick={onBack} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 'var(--text-title3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', margin: 0 }}>
            Sessions
          </h2>
        </div>
        <button
          onClick={onNewSession}
          style={{
            padding: 'var(--space-1) var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--separator)',
            background: 'var(--fill-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-footnote)',
            fontWeight: 'var(--weight-medium)',
            cursor: 'pointer',
          }}
        >
          + New
        </button>
      </div>

      {/* Agent info bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-4)',
        background: 'var(--fill-secondary)',
        borderBottom: '1px solid var(--separator)',
      }}>
        <AgentAvatar agent={agent} size={32} borderRadius={8} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--text-subheadline)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
            {agent.name}
          </div>
          <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--text-tertiary)' }}>
            {agent.title}
          </div>
        </div>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            No sessions. Click "New" to start.
          </div>
        ) : (
          sessions.map(session => {
            const isActive = session.key === activeSessionKey
            const ctx = session.key.split(':').pop() || 'main'
            const label = session.title || session.label || ctx

            return (
              <div
                key={session.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 'var(--space-3) var(--space-4)',
                  background: isActive ? 'var(--accent-fill)' : 'transparent',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--separator)',
                  transition: 'all 100ms var(--ease-smooth)',
                }}
                onClick={() => onSelect(session.key)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 'var(--text-subheadline)',
                    fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  }}>
                    {label}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back to agents"
      style={{
        padding: 'var(--space-1) var(--space-2)',
        borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-primary)',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
  )
}