'use client'
import { useEffect, useState, useCallback, useRef, Suspense, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Agent } from '@/lib/types'
import { useAgentsContext } from '@/app/agents-provider'
import { useAgentsSlot } from '@/components/AgentsSlotContext'
import { useChatManagerContext } from '@/components/ChatManagerProvider'
import { SessionList, SessionListMobile } from '@/components/chat/SessionList'
import { WebSocketChatView } from '@/components/chat/WebSocketChatView'
import { useAgentChat } from '@/lib/agents/use-agent-chat'
import { AgentAvatar } from '@/components/AgentAvatar'

/* ── Agent list for sidebar injection ─────────────────────────────── */

function SidebarAgentList({
  agents,
  activeId,
  onSelect,
  loading,
  runningAgentIds,
}: {
  agents: Agent[]
  activeId: string | null
  onSelect: (agent: Agent) => void
  loading?: boolean
  runningAgentIds: string[]
}) {
  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div style={{
      maxHeight: 400,
      overflowY: 'auto',
      padding: 'var(--space-1) 0',
      marginLeft: 'var(--space-3)',
      borderLeft: '2px solid var(--separator)',
    }}>
      {loading ? (
        <div style={{ padding: 'var(--space-1) var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-caption1)' }}>
          Loading...
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: 'var(--space-1) var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-caption1)' }}>
          No agents
        </div>
      ) : (
        sorted.map(agent => {
          const isActive = agent.id === activeId
          const isBusy = runningAgentIds.includes(agent.id)
          return (
            <button
              key={agent.id}
              onClick={() => onSelect(agent)}
              className={`nav-item focus-ring ${isActive ? 'nav-item-active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                width: '100%',
                padding: 'var(--space-1) var(--space-2)',
                background: isActive ? 'var(--accent-fill)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <AgentAvatar agent={agent} size={20} borderRadius={5} />
              <span style={{
                flex: 1,
                fontSize: 'var(--text-caption1)',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {agent.name}{isBusy ? ' ⏳' : ''}
              </span>
            </button>
          )
        })
      )}
    </div>
  )
}

/* ── Main messenger app ─────────────────────────────────────────────── */

function MessengerApp() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { agents, loading } = useAgentsContext()
  const { setAgentsSlot } = useAgentsSlot()
  const { runningAgentIds } = useChatManagerContext()

  const [activeAgentId, setActiveAgentId] = useState<string | null>(searchParams.get('agent'))
  const [mobileShowChat, setMobileShowChat] = useState(false)

  // Set default active agent on desktop
  useEffect(() => {
    if (!loading && agents.length > 0 && !activeAgentId) {
      if (window.innerWidth >= 768) {
        setActiveAgentId(agents[0].id)
      }
    }
  }, [loading, agents, activeAgentId])

  // Inject agent list into sidebar
  useEffect(() => {
    setAgentsSlot(
      <SidebarAgentList
        agents={agents}
        activeId={activeAgentId}
        onSelect={(agent) => {
          setActiveAgentId(agent.id)
          router.replace(`/chat?agent=${agent.id}`, { scroll: false })
        }}
        loading={loading}
        runningAgentIds={runningAgentIds}
      />
    )

    // Cleanup on unmount
    return () => setAgentsSlot(null)
  }, [agents, activeAgentId, loading, setAgentsSlot, router, runningAgentIds])

  const handleSelectAgent = useCallback((agent: Agent) => {
    setActiveAgentId(agent.id)
    router.replace(`/chat?agent=${agent.id}`, { scroll: false })
  }, [router])

  const activeAgent = agents.find(a => a.id === activeAgentId) || null

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      {/* Desktop: Sessions column + Chat view */}
      <div
        className="hidden md:flex"
        style={{ flex: 1, height: '100%' }}
      >
        {activeAgent ? (
          <ChatLayout agent={activeAgent} />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Mobile: Sessions or Chat */}
      {activeAgent && (
        <MobileChatLayout
          agent={activeAgent}
          showChat={mobileShowChat}
          setShowChat={setMobileShowChat}
          onSelectAgent={handleSelectAgent}
        />
      )}
    </div>
  )
}

/* ── Desktop chat layout (Sessions + Chat) ─────────────────────────── */

function ChatLayout({ agent }: { agent: Agent }) {
  const chat = useAgentChat({ agentId: agent.id })

  return (
    <>
      {/* Sessions column */}
      <SessionList
        agent={agent}
        sessions={chat.sessions}
        activeSessionKey={chat.sessionKey}
        onSelect={chat.setSessionKey}
        onNewSession={chat.addContext}
        onDeleteSession={chat.removeContext}
        loading={chat.sessionsLoading}
      />

      {/* Chat view */}
      <WebSocketChatView
        key={agent.id}
        agent={agent}
        chat={chat}
        onBack={undefined}
      />
    </>
  )
}

/* ── Mobile chat layout ───────────────────────────────────────────── */

function MobileChatLayout({
  agent,
  showChat,
  setShowChat,
  onSelectAgent,
}: {
  agent: Agent
  showChat: boolean
  setShowChat: (v: boolean) => void
  onSelectAgent: (agent: Agent) => void
}) {
  const chat = useAgentChat({ agentId: agent.id })

  if (showChat) {
    return (
      <div
        className="flex flex-col md:hidden"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 20,
          background: 'var(--bg)',
        }}
      >
        <WebSocketChatView
          key={agent.id}
          agent={agent}
          chat={chat}
          onBack={() => setShowChat(false)}
        />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col md:hidden"
      style={{ flex: 1, height: '100%' }}
    >
      <SessionListMobile
        agent={agent}
        sessions={chat.sessions}
        activeSessionKey={chat.sessionKey}
        onSelect={(key) => {
          chat.setSessionKey(key)
          setShowChat(true)
        }}
        onNewSession={() => {
          chat.addContext()
          setShowChat(true)
        }}
        onDeleteSession={chat.removeContext}
        onBack={() => onSelectAgent(agent)}
        loading={chat.sessionsLoading}
      />
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      gap: 'var(--space-3)',
      padding: 'var(--space-8)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 'var(--space-2)' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div style={{
        fontSize: 'var(--text-title3)',
        fontWeight: 'var(--weight-bold)',
        color: 'var(--text-primary)',
        letterSpacing: '-0.3px',
      }}>
        ClawPort Chat
      </div>
      <div style={{
        fontSize: 'var(--text-subheadline)',
        color: 'var(--text-secondary)',
        textAlign: 'center',
        lineHeight: 'var(--leading-relaxed)',
      }}>
        Select an agent from the sidebar to start chatting
      </div>
    </div>
  )
}

/* ── Page entry point ─────────────────────────────────────────────── */

export default function ChatPage() {
  return (
    <Suspense>
      <MessengerApp />
    </Suspense>
  )
}