'use client'
import { useState } from 'react'
import type { Agent } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { AgentAvatar } from '@/components/AgentAvatar'

interface AgentListMobileProps {
  agents: Agent[]
  onSelect: (agent: Agent) => void
  loading?: boolean
}

export function AgentListMobile({ agents, onSelect, loading }: AgentListMobileProps) {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? agents.filter(a => {
        const q = search.toLowerCase()
        return a.name.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)
      })
    : agents

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
    }}>
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
          fontSize: 'var(--text-title1)',
          fontWeight: 'var(--weight-bold)',
          letterSpacing: '-0.5px',
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          Messages
        </h2>

        {/* Search */}
        <div style={{
          marginTop: 'var(--space-3)',
          background: 'var(--fill-tertiary)',
          borderRadius: 'var(--radius-md)',
          padding: '10px var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
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
              fontSize: 'var(--text-subheadline)',
              color: 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: 0,
              margin: 0,
              lineHeight: 1.4,
            }}
          />
        </div>
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1) 0' }} role="listbox" aria-label="Agent list">
        {loading ? (
          <div style={{ padding: 'var(--space-1) 0' }} role="status" aria-label="Loading agents">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' }}>
                <Skeleton className="rounded-full" style={{ width: 44, height: 44, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <Skeleton style={{ width: '55%', height: 15 }} />
                  <Skeleton style={{ width: '80%', height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 && search.trim() ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-8) var(--space-4)', textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-subheadline)', color: 'var(--text-tertiary)', lineHeight: 'var(--leading-relaxed)' }}>
              No agents match &lsquo;{search.trim()}&rsquo;
            </div>
          </div>
        ) : (
          sorted.map(agent => (
            <button
              key={agent.id}
              onClick={() => onSelect(agent)}
              role="option"
              aria-selected={false}
              className="hover-bg focus-ring"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <AgentAvatar agent={agent} size={44} borderRadius={22} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: 'var(--system-green)', border: '2px solid var(--bg)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subheadline)', color: 'var(--text-primary)', letterSpacing: '-0.2px', marginBottom: 2 }}>
                  {agent.name}
                </div>
                <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.title || agent.description?.slice(0, 60) || 'Agent'}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}