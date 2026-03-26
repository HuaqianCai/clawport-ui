/**
 * Multi-session state management hook for chat.
 *
 * Architecture:
 * - UI Layer: agentViews (updated by sessions.changed events) - renders left sidebar
 * - State Layer: sessionStates (lazy-created on select) - manages chat content
 *
 * Key concepts:
 * - SessionState is only created when user selects a session
 * - Session running status is driven by sessions.changed events
 * - Events are routed to the correct SessionState by sessionKey
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGateway } from '@/components/GatewayProvider'
import {
  chatSend,
  chatHistory,
  chatAbort,
  sessionsList,
  sessionsDelete,
  registerAgentStreamHandler,
  registerSessionsChangedHandler,
  registerSessionToolHandler,
  registerSessionMessageHandler,
  AgentStreamPayload,
  SessionsChangedPayload,
  SessionToolPayload,
  SessionMessagePayload,
} from '@/lib/gateway-ws-client'
import {
  AgentViewState,
  Attachment,
  ChatGlobalConfig,
  ContentBlock,
  DEFAULT_CHAT_CONFIG,
  isSilentReplyMessage,
  parseAgentId,
  SessionMeta,
  SessionState,
  SessionStatus,
  WsMessage,
} from './types'
import { generateId } from '@/lib/id'
import type { ChatMessage } from '@/lib/gateway-ws-client'

// ============ Types ============

/** Convert ChatMessage from gateway-ws-client to WsMessage */
function toWsMessage(msg: ChatMessage): WsMessage {
  return {
    id: undefined,
    role: msg.role,
    content: typeof msg.content === 'string' ? msg.content : (msg.content as ContentBlock[]),
    timestamp: msg.timestamp || Date.now(),
    toolName: msg.toolName,
    isError: msg.isError,
    provenance: msg.provenance,
  }
}

export interface UseChatManagerReturn {
  // Active session state (for rendering chat view)
  activeSessionState: SessionState | null
  messages: WsMessage[]
  stream: string | null
  status: SessionStatus
  error: string | null

  // UI rendering
  agentViews: Map<string, AgentViewState>
  activeSessionKey: string | null
  runningSessionKeys: string[]
  runningAgentIds: string[]

  // Operations
  selectSession: (sessionKey: string) => Promise<void>
  deleteSession: (sessionKey: string) => Promise<void>
  sendMessage: (text: string, attachments?: Attachment[]) => Promise<void>
  abort: () => Promise<void>
  refreshHistory: () => Promise<void>
}

// ============ Helper: Format attachments for API ============

function formatAttachments(attachments?: Attachment[]): Array<{
  type: string
  mimeType: string
  content: string
}> | undefined {
  if (!attachments?.length) return undefined
  return attachments.map(att => ({
    type: 'image',
    mimeType: att.mimeType,
    content: att.dataUrl.replace(/^data:[^;]+;base64,/, ''),
  }))
}

// ============ Hook Implementation ============

export function useChatManager(config: Partial<ChatGlobalConfig> = {}): UseChatManagerReturn {
  const { isReady, isConnected } = useGateway()
  const cfg = { ...DEFAULT_CHAT_CONFIG, ...config }

  // ============ State ============

  // UI Layer: agent views (updated by sessions.changed events)
  const [agentViews, setAgentViews] = useState<Map<string, AgentViewState>>(new Map())

  // State Layer: session states (lazy-created on select)
  const [sessionStates, setSessionStates] = useState<Map<string, SessionState>>(new Map())

  // Active session key
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null)

  // Refs for event handling
  const sessionStatesRef = useRef(sessionStates)
  const activeSessionKeyRef = useRef(activeSessionKey)
  const currentRunIdsRef = useRef<Map<string, string>>(new Map()) // Track current runId per session

  // Keep refs in sync
  useEffect(() => {
    sessionStatesRef.current = sessionStates
  }, [sessionStates])

  useEffect(() => {
    activeSessionKeyRef.current = activeSessionKey
  }, [activeSessionKey])

  // ============ Computed Properties ============

  const activeSessionState = activeSessionKey
    ? sessionStates.get(activeSessionKey) || null
    : null

  const runningSessionKeys = [...sessionStates.values()]
    .filter(s => s.runId)
    .map(s => s.sessionKey)

  // Compute which agents have running sessions
  const runningAgentIds = [...agentViews.values()]
    .filter(view => view.sessions.some(s => s.status === 'running'))
    .map(view => view.agentId)

  // ============ Initial sessions.list load (one-time) ============

  const loadSessionsOnce = useCallback(async () => {
    if (!isReady) return

    try {
      const result = await sessionsList({ limit: 100 })
      // Convert SessionInfo[] to SessionMeta[]
      const metas: SessionMeta[] = (result.sessions || []).map(s => ({
        key: s.key,
        agentId: parseAgentId(s.key),
        status: s.status === 'running' ? 'running' as const : 'idle' as const,
        updatedAt: s.updatedAt || 0,
        model: s.model,
        sessionId: s.sessionId,
        kind: s.kind,
        chatType: s.chatType,
        title: s.title,
        label: s.label,
      }))

      // Group by agent and build agentViews
      const byAgent = new Map<string, SessionMeta[]>()
      for (const meta of metas) {
        if (!byAgent.has(meta.agentId)) {
          byAgent.set(meta.agentId, [])
        }
        byAgent.get(meta.agentId)!.push(meta)
      }

      setAgentViews(prev => {
        const next = new Map(prev)
        for (const [agentId, sessions] of byAgent) {
          next.set(agentId, {
            agentId,
            sessions: sessions.sort((a, b) => b.updatedAt - a.updatedAt),
            selectedSessionKey: null,
          })
        }
        return next
      })
    } catch (err) {
      console.error('[useChatManager] loadSessionsOnce error:', err)
    }
  }, [isReady])

  // Load sessions once on connect
  useEffect(() => {
    if (!isReady || !isConnected) return
    loadSessionsOnce()
  }, [loadSessionsOnce, isReady, isConnected])

  // ============ Select Session (Lazy Create) ============

  const selectSession = useCallback(async (sessionKey: string) => {
    // Always update activeSessionKey (even if session already active)
    // This ensures switching agents properly activates the session
    setActiveSessionKey(sessionKey)

    // Update agentViews
    const agentId = parseAgentId(sessionKey)
    setAgentViews(prev => {
      const next = new Map(prev)
      const view = next.get(agentId)
      if (view) {
        const sessionExists = view.sessions.some(s => s.key === sessionKey)
        const newSessions = sessionExists
          ? view.sessions
          : [
              { key: sessionKey, agentId, status: 'idle' as const, updatedAt: Date.now() },
              ...view.sessions,
            ]
        next.set(agentId, {
          ...view,
          sessions: newSessions,
          selectedSessionKey: sessionKey,
        })
      } else {
        next.set(agentId, {
          agentId,
          sessions: [{ key: sessionKey, agentId, status: 'idle' as const, updatedAt: Date.now() }],
          selectedSessionKey: sessionKey,
        })
      }
      return next
    })

    // Lazy create SessionState if not exists
    if (!sessionStatesRef.current.has(sessionKey)) {
      const newState: SessionState = {
        sessionKey,
        messages: [],
        stream: null,
        runId: null,
        status: 'idle',
        eventSource: null,
        lastAccessedAt: Date.now(),
        error: null,
      }

      setSessionStates(prev => {
        const next = new Map(prev)
        next.set(sessionKey, newState)
        return next
      })

      // Load history
      try {
        const history = await chatHistory(sessionKey, 10)
        const messages: WsMessage[] = (history.messages || [])
          .filter(m => !isSilentReplyMessage(toWsMessage(m)))
          .map(m => toWsMessage(m))

        setSessionStates(prev => {
          const next = new Map(prev)
          const s = next.get(sessionKey)
          if (s) {
            s.messages = messages
            s.error = null
          }
          return next
        })
      } catch (err) {
        setSessionStates(prev => {
          const next = new Map(prev)
          const s = next.get(sessionKey)
          if (s) s.error = err instanceof Error ? err.message : 'Failed to load history'
          return next
        })
      }
    } else {
      setSessionStates(prev => {
        const next = new Map(prev)
        const s = next.get(sessionKey)
        if (s) s.lastAccessedAt = Date.now()
        return next
      })
    }

    cleanupSessionStates()
  }, [])

  // ============ Send Message ============

  const sendMessage = useCallback(async (text: string, attachments?: Attachment[]) => {
    const sessionKey = activeSessionKeyRef.current
    if (!sessionKey || !isReady) return

    const runId = generateId()

    console.log('[sendMessage] Sending message:', {
      sessionKey,
      text: text.slice(0, 50),
      runId,
    })

    // Set runId in ref for immediate use by event handlers
    currentRunIdsRef.current.set(sessionKey, runId)

    // Add user message to chat immediately
    const userMessage: WsMessage = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    // Update session state to running and add user message
    setSessionStates(prev => {
      const next = new Map(prev)
      const s = next.get(sessionKey)
      if (s) {
        s.status = 'running'
        s.runId = runId
        s.stream = ''
        s.lastAccessedAt = Date.now()
        s.error = null
        s.messages = [...s.messages, userMessage]
      }
      return next
    })

    // Immediately update agentViews to show running indicator
    // (sessions.changed event will sync status later)
    const agentId = parseAgentId(sessionKey)
    setAgentViews(prev => {
      const next = new Map(prev)
      const view = next.get(agentId)
      if (view) {
        const sessions = view.sessions.map(s =>
          s.key === sessionKey ? { ...s, status: 'running' as const } : s
        )
        next.set(agentId, { ...view, sessions })
      }
      return next
    })

    try {
      const result = await chatSend({
        sessionKey,
        message: text,
        attachments: formatAttachments(attachments),
        idempotencyKey: runId,
      })

      // Update runId from gateway response (may differ from idempotencyKey)
      if (result.runId && result.runId !== runId) {
        currentRunIdsRef.current.set(sessionKey, result.runId)
        setSessionStates(prev => {
          const next = new Map(prev)
          const s = next.get(sessionKey)
          if (s && s.runId === runId) {
            s.runId = result.runId
          }
          return next
        })
      }
    } catch (err) {
      currentRunIdsRef.current.delete(sessionKey)
      setSessionStates(prev => {
        const next = new Map(prev)
        const s = next.get(sessionKey)
        if (s) {
          s.error = err instanceof Error ? err.message : 'Failed to send'
          s.status = 'error'
          s.runId = null
          s.stream = null
        }
        return next
      })
      // Error status will be updated by sessions.changed event
    }
  }, [isReady])

  // ============ Abort ============

  const abort = useCallback(async () => {
    const sessionKey = activeSessionKeyRef.current
    if (!sessionKey || !isReady) return

    const state = sessionStatesRef.current.get(sessionKey)
    if (!state?.runId) return

    try {
      await chatAbort(sessionKey, state.runId)
    } catch (err) {
      console.error('[useChatManager] abort error:', err)
    }
  }, [isReady])

  // ============ Delete Session ============

  const deleteSession = useCallback(async (sessionKey: string) => {
    if (!isReady) return

    try {
      await sessionsDelete(sessionKey)

      const agentId = parseAgentId(sessionKey)
      setAgentViews(prev => {
        const next = new Map(prev)
        const agentView = next.get(agentId)
        if (agentView) {
          agentView.sessions = agentView.sessions.filter(s => s.key !== sessionKey)
          if (agentView.selectedSessionKey === sessionKey) {
            agentView.selectedSessionKey = null
          }
        }
        return next
      })

      setSessionStates(prev => {
        const next = new Map(prev)
        if (next.has(sessionKey)) {
          next.delete(sessionKey)
        }
        return next
      })

      if (activeSessionKeyRef.current === sessionKey) {
        setActiveSessionKey(null)
      }
    } catch (err) {
      console.error('[useChatManager] deleteSession error:', err)
      throw err
    }
  }, [isReady])

  // ============ Refresh History ============

  const refreshHistory = useCallback(async () => {
    const sessionKey = activeSessionKeyRef.current
    if (!sessionKey) return

    const state = sessionStatesRef.current.get(sessionKey)
    if (!state || state.status === 'running' || state.status === 'resuming') return

    try {
      const history = await chatHistory(sessionKey, 200)
      const messages: WsMessage[] = (history.messages || [])
        .filter(m => !isSilentReplyMessage(toWsMessage(m)))
        .map(m => toWsMessage(m))

      setSessionStates(prev => {
        const next = new Map(prev)
        const s = next.get(sessionKey)
        if (s) {
          s.messages = messages
          s.error = null
        }
        return next
      })
    } catch (err) {
      setSessionStates(prev => {
        const next = new Map(prev)
        const s = next.get(sessionKey)
        if (s) s.error = err instanceof Error ? err.message : 'Failed to refresh'
        return next
      })
    }
  }, [])

  // ============ Cleanup ============

  const cleanupSessionStates = useCallback(() => {
    setSessionStates(prev => {
      if (prev.size <= cfg.maxSessionStates) return prev

      const entries = [...prev.entries()]
        .filter(([key]) => key !== activeSessionKeyRef.current)
        .filter(([, s]) => !s.runId)
        .sort((a, b) => b[1].lastAccessedAt - a[1].lastAccessedAt)

      const toRemove = entries.slice(cfg.maxSessionStates - 1)

      const next = new Map(prev)
      for (const [key] of toRemove) {
        next.delete(key)
      }
      return next
    })
  }, [cfg.maxSessionStates])

  // ============ Event Handlers ============

  // Register sessions.changed handler to update session status
  // This is the single source of truth for running status
  // phase: 'start' | 'message' = running, 'end' = done
  useEffect(() => {
    if (!isReady) return

    registerSessionsChangedHandler((event: SessionsChangedPayload) => {
      const { sessionKey, phase, ts, messageId, messageSeq, runId } = event
      const agentId = parseAgentId(sessionKey)

      console.log('[registerSessionsChangedHandler] Received event:', {
        sessionKey,
        agentId,
        phase,
        runId,
        messageId,
        messageSeq,
      })

      // Determine status from phase
      // 'start' and 'message' mean running, 'end' means done
      const isRunning = phase === 'start' || phase === 'message'
      const newStatus: SessionMeta['status'] = isRunning ? 'running' : 'idle'

      // Update agentViews - this is the source of truth for session status
      setAgentViews(prev => {
        const next = new Map(prev)
        const view = next.get(agentId)

        if (view) {
          // Update existing session or add new one
          const sessionIndex = view.sessions.findIndex(s => s.key === sessionKey)
          if (sessionIndex >= 0) {
            // Update existing session
            const sessions = [...view.sessions]
            sessions[sessionIndex] = {
              ...sessions[sessionIndex],
              status: newStatus,
              updatedAt: ts || Date.now(),
            }
            next.set(agentId, { ...view, sessions })
          } else {
            // Add new session (discovered via event)
            const newSession: SessionMeta = {
              key: sessionKey,
              agentId,
              status: newStatus,
              updatedAt: ts || Date.now(),
            }
            next.set(agentId, {
              ...view,
              sessions: [newSession, ...view.sessions],
            })
          }
        } else {
          // Create new agent view with this session
          const newSession: SessionMeta = {
            key: sessionKey,
            agentId,
            status: newStatus,
            updatedAt: ts || Date.now(),
          }
          next.set(agentId, {
            agentId,
            sessions: [newSession],
            selectedSessionKey: null,
          })
        }

        return next
      })

      // Update sessionStates if it exists
      setSessionStates(prev => {
        const next = new Map(prev)
        const s = next.get(sessionKey)
        if (s) {
          if (phase === 'end') {
            // Run completed
            s.status = 'completed'
            s.runId = null
            s.stream = null
            currentRunIdsRef.current.delete(sessionKey)
          } else if (phase === 'start' || phase === 'message') {
            s.status = 'running'
          }
        }
        return next
      })
    })

    return () => {
      registerSessionsChangedHandler(null)
    }
  }, [isReady])

  // Register global agent stream event handler
  // Handles streaming content and tool events
  useEffect(() => {
    if (!isReady) return

    registerAgentStreamHandler((event: AgentStreamPayload) => {
      const { sessionKey, stream, runId, data } = event
      const sessionState = sessionStatesRef.current.get(sessionKey)

      console.log('[registerAgentStreamHandler] Received event:', {
        sessionKey,
        stream,
        runId,
        phase: data?.phase,
        hasSessionState: !!sessionState,
        sessionRunId: sessionState?.runId,
        eventSource: sessionState?.eventSource,
      })

      if (!sessionState) return

      // Handle lifecycle events first (before runId check)
      if (stream === 'lifecycle') {
        if (data.phase === 'start') {
          // Update runId synchronously in ref for immediate use by subsequent events
          currentRunIdsRef.current.set(sessionKey, runId)
          setSessionStates(prev => {
            const next = new Map(prev)
            const s = next.get(sessionKey)
            if (s && s.eventSource === null) {
              s.eventSource = 'agent'
              s.runId = runId
            }
            return next
          })
        } else if (data.phase === 'end') {
          // Run completed - clear runId from ref
          currentRunIdsRef.current.delete(sessionKey)
          setSessionStates(prev => {
            const next = new Map(prev)
            const s = next.get(sessionKey)
            if (s) {
              const finalStream = s.stream
              if (finalStream) {
                s.messages = [...s.messages, {
                  role: 'assistant' as const,
                  content: finalStream,
                  timestamp: Date.now(),
                }]
              }
              s.stream = null
              s.runId = null
              s.status = 'completed'
              s.eventSource = null
            }
            return next
          })
          // Status in agentViews will be updated by sessions.changed event
        }
        return
      }

      // Filter by runId for non-lifecycle events
      const currentRunId = currentRunIdsRef.current.get(sessionKey)
      if (currentRunId && runId !== currentRunId) return

      // Handle assistant stream
      if (stream === 'assistant') {
        setSessionStates(prev => {
          const next = new Map(prev)
          const s = next.get(sessionKey)
          if (s) {
            if (data.text !== undefined && data.text !== null) {
              s.stream = data.text || null
            } else if (data.delta) {
              s.stream = (s.stream || '') + data.delta
            }
          }
          return next
        })
      }

      // Handle tool events from agent stream
      if (stream === 'tool') {
        setSessionStates(prev => {
          const next = new Map(prev)
          const s = next.get(sessionKey)
          if (!s) return next

          if (s.stream) {
            s.messages = [...s.messages, {
              role: 'assistant' as const,
              content: s.stream,
              timestamp: Date.now(),
            }]
            s.stream = null
          }

          if (data.phase === 'start') {
            s.messages = [...s.messages, {
              role: 'assistant' as const,
              content: [{
                type: 'toolCall' as const,
                name: data.toolName,
                args: data.toolInput as Record<string, unknown>,
              }],
              timestamp: Date.now(),
            }]
          } else if (data.phase === 'end') {
            s.messages = [...s.messages, {
              role: 'toolResult' as const,
              content: typeof data.toolResult === 'string'
                ? data.toolResult
                : JSON.stringify(data.toolResult, null, 2),
              timestamp: Date.now(),
              toolName: data.toolName,
              isError: false,
            }]
          }

          return next
        })
      }
    })

    return () => {
      registerAgentStreamHandler(null)
    }
  }, [isReady])

  // Register session.tool handler to render tool execution
  useEffect(() => {
    if (!isReady) return

    registerSessionToolHandler((event: SessionToolPayload) => {
      const { sessionKey, data } = event
      const sessionState = sessionStatesRef.current.get(sessionKey)

      console.log('[registerSessionToolHandler] Received event:', {
        sessionKey,
        phase: data.phase,
        name: data.name,
        toolCallId: data.toolCallId,
        hasSessionState: !!sessionState,
      })

      if (!sessionState) return

      setSessionStates(prev => {
        const next = new Map(prev)
        const s = next.get(sessionKey)
        if (!s) return next

        if (s.stream) {
          s.messages = [...s.messages, {
            role: 'assistant' as const,
            content: s.stream,
            timestamp: Date.now(),
          }]
          s.stream = null
        }

        if (data.phase === 'start') {
          s.messages = [...s.messages, {
            role: 'assistant' as const,
            content: [{
              type: 'toolCall' as const,
              name: data.name,
              args: data.args || {},
            }],
            timestamp: Date.now(),
          }]
        } else if (data.phase === 'result') {
          s.messages = [...s.messages, {
            role: 'toolResult' as const,
            content: data.meta || '',
            timestamp: Date.now(),
            toolName: data.name,
            isError: data.isError || false,
          }]
        }

        return next
      })
    })

    return () => {
      registerSessionToolHandler(null)
    }
  }, [isReady])

  // Register session.message handler (for logging/debugging only)
  // session.message events are for session state changes, not for chat display
  // Chat messages come from agent stream events via agentStreamHandler
  useEffect(() => {
    if (!isReady) return

    registerSessionMessageHandler((event: SessionMessagePayload) => {
      const { sessionKey, message } = event

      console.log('[registerSessionMessageHandler] Received session.message event:', {
        sessionKey,
        role: message.role,
        messageId: event.messageId,
        // Not adding to chat - session messages are for state tracking
      })
    })

    return () => {
      registerSessionMessageHandler(null)
    }
  }, [isReady])

  // ============ Return ============

  return {
    activeSessionState,
    messages: activeSessionState?.messages || [],
    stream: activeSessionState?.stream || null,
    status: activeSessionState?.status || 'idle',
    error: activeSessionState?.error || null,

    agentViews,
    activeSessionKey,
    runningSessionKeys,
    runningAgentIds,

    selectSession,
    deleteSession,
    sendMessage,
    abort,
    refreshHistory,
  }
}