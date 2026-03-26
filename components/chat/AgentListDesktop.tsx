'use client'
import { useState } from 'react'
import type { Agent } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { AgentAvatar } from '@/components/AgentAvatar'

interface AgentListProps {
  agents: Agent[]
  activeId: string | null
  onSelect: (agent: Agent) => void
  loading?: boolean
}

export function AgentList({ agents, activeId, onSelect, loading }: AgentListProps) {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? agents.filter(a => {
        const q = search.toLowerCase()
        return a.name.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)
      })
    : agents

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div
      className="hidden md:flex md:flex-col"
      style={{
        width: 300,
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        backdropFilter: 'var(--sidebar-backdrop)',
        WebkitBackdropFilter: 'var(--sidebar-backdrop)',
        borderRight: '1px solid var(--separator)',
        height: '100%',
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
        <h2 style={{
          fontSize: 'var(--text-title2)',
          fontWeight: 'var(--weight-bold)',
          letterSpacing: '-0.5px',
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          Messages
        </h2>

        {/* Search */}
        <SearchInput search={search} setSearch={setSearch} />
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1) 0' }} role="listbox" aria-label="Agent list">
        {loading ? (
          <LoadingSkeleton />
        ) : sorted.length === 0 && search.trim() ? (
          <EmptyState search={search} />
        ) : (
          sorted.map(agent => (
            <AgentItem
              key={agent.id}
              agent={agent}
              isActive={agent.id === activeId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────────── */

function SearchInput({ search, setSearch }: { search: string; setSearch: (v: string) => void }) {
  return (
    <div style={{
      marginTop: 'var(--space-3)',
      background: 'var(--fill-tertiary)',
      borderRadius: 'var(--radius-md)',
      padding: '7px var(--space-3)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
    }}>
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search agents..."
        aria-label="Search agents"
        className="focus-ring"
        style={{
          flex: 1,
          fontSize: 'var(--text-footnote)',
          color: 'var(--text-primary)',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          margin: 0,
          lineHeight: 1.4,
        }}
      />
      {search.trim() && (
        <button
          className="btn-ghost focus-ring"
          onClick={() => setSearch('')}
          aria-label="Clear search"
          style={{ padding: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 'var(--space-1) 0' }} role="status" aria-label="Loading agents">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' }}>
          <Skeleton className="rounded-full" style={{ width: 40, height: 40, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Skeleton style={{ width: '55%', height: 14 }} />
            <Skeleton style={{ width: '80%', height: 11 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ search }: { search: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-8) var(--space-4)', textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--text-tertiary)', lineHeight: 'var(--leading-relaxed)' }}>
        No agents match &lsquo;{search}&rsquo;
      </div>
    </div>
  )
}

function AgentItem({ agent, isActive, onSelect }: { agent: Agent; isActive: boolean; onSelect: (agent: Agent) => void }) {
  return (
    <button
      onClick={() => onSelect(agent)}
      role="option"
      aria-selected={isActive}
      className="hover-bg focus-ring"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        background: isActive ? 'var(--fill-secondary)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <AgentAvatar agent={agent} size={40} borderRadius={20} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: 'var(--system-green)', border: '1.5px solid var(--bg)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-footnote)', color: 'var(--text-primary)', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
          {agent.name}
        </div>
        <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.title || agent.description?.slice(0, 50) || 'Agent'}
        </div>
      </div>
    </button>
  )
}