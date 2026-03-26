'use client'
import type { SessionInfo } from '@/lib/gateway-ws-client'
import type { Agent } from '@/lib/types'
import { AgentAvatar } from '@/components/AgentAvatar'
import { formatTimeAgo } from './MessageUtils'

interface SessionListProps {
  agent: Agent
  sessions: SessionInfo[]
  activeSessionKey: string | null
  onSelect: (sessionKey: string) => void
  onNewSession: () => void
  onDeleteSession: (sessionKey: string) => void
  loading?: boolean
}

export function SessionList({
  agent,
  sessions,
  activeSessionKey,
  onSelect,
  onNewSession,
  onDeleteSession,
  loading,
}: SessionListProps) {
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        backdropFilter: 'var(--sidebar-backdrop)',
        WebkitBackdropFilter: 'var(--sidebar-backdrop)',
        borderRight: '1px solid var(--separator)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: 'var(--space-4) var(--space-4) var(--space-3)',
        borderBottom: '1px solid var(--separator)',
        background: 'var(--material-thick)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontSize: 'var(--text-title2)',
            fontWeight: 'var(--weight-bold)',
            letterSpacing: '-0.5px',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Sessions
          </h2>
          <NewSessionButton onClick={onNewSession} />
        </div>

        {/* Agent info */}
        <AgentInfoBar agent={agent} />
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1) 0' }} role="listbox" aria-label="Session list">
        {loading ? (
          <LoadingState />
        ) : sessions.length === 0 ? (
          <EmptyState />
        ) : (
          sessions.map(session => (
            <SessionItem
              key={session.key}
              session={session}
              isActive={session.key === activeSessionKey}
              sessionsCount={sessions.length}
              onSelect={onSelect}
              onDeleteSession={onDeleteSession}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────── */

function NewSessionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="New session"
      style={{
        padding: '4px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--separator)',
        background: 'var(--fill-tertiary)',
        color: 'var(--text-primary)',
        fontSize: 'var(--text-caption1)',
        fontWeight: 'var(--weight-medium)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      New
    </button>
  )
}

function AgentInfoBar({ agent }: { agent: Agent }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      marginTop: 'var(--space-3)',
      padding: 'var(--space-2)',
      background: 'var(--fill-secondary)',
      borderRadius: 'var(--radius-md)',
    }}>
      <AgentAvatar agent={agent} size={28} borderRadius={7} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.name}
        </div>
        <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.title}
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
      Loading sessions...
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
      No sessions yet. Click "New" to start.
    </div>
  )
}

function SessionItem({
  session,
  isActive,
  sessionsCount,
  onSelect,
  onDeleteSession,
}: {
  session: SessionInfo
  isActive: boolean
  sessionsCount: number
  onSelect: (key: string) => void
  onDeleteSession: (key: string) => void
}) {
  const ctx = session.key.split(':').pop() || 'main'
  const label = session.title || session.label || ctx
  const timeAgo = session.updatedAt ? formatTimeAgo(session.updatedAt) : ''
  const isRunning = session.status === 'running'

  return (
    <div
      role="option"
      aria-selected={isActive}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: 'var(--space-2) var(--space-4)',
        background: isActive ? 'var(--accent-fill)' : 'transparent',
        cursor: 'pointer',
        borderBottom: '1px solid var(--separator)',
        transition: 'all 100ms var(--ease-smooth)',
      }}
      onClick={() => onSelect(session.key)}
    >
      {isRunning && <RunningIndicator />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-footnote)',
          fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-medium)',
          color: isActive ? 'var(--accent)' : 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {isRunning && <RunningLabel />}
          {timeAgo && <TimeLabel text={timeAgo} />}
        </div>
      </div>
      {sessionsCount > 1 && (
        <DeleteButton sessionKey={session.key} onDeleteSession={onDeleteSession} />
      )}
    </div>
  )
}

function RunningIndicator() {
  return (
    <div style={{
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--system-green)',
      marginRight: 'var(--space-2)',
      animation: 'pulse-green 1.5s ease-in-out infinite',
    }} />
  )
}

function RunningLabel() {
  return (
    <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--system-green)', fontWeight: 500 }}>
      Running...
    </span>
  )
}

function TimeLabel({ text }: { text: string }) {
  return (
    <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--text-tertiary)' }}>
      {text}
    </span>
  )
}

function DeleteButton({ sessionKey, onDeleteSession }: { sessionKey: string; onDeleteSession: (key: string) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (confirm('Delete this session?')) {
          onDeleteSession(sessionKey)
        }
      }}
      title="Delete session"
      style={{
        padding: '4px 6px',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
        opacity: 0.6,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '1'
        e.currentTarget.style.color = 'var(--system-red)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '0.6'
        e.currentTarget.style.color = 'var(--text-tertiary)'
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="3,6 5,6 21,6" />
        <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2" />
      </svg>
    </button>
  )
}