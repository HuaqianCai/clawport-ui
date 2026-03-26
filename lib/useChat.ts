/**
 * Hook for managing chat via WebSocket.
 *
 * Handles:
 * - Loading chat history from gateway
 * - Sending messages via chat.send
 * - Receiving streaming responses via events
 * - Session management via sessions.list
 * - Model selection via models.list and sessions.patch
 */

'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  chatSend,
  chatHistory,
  chatAbort,
  sessionsList,
  sessionsPatch,
  sessionsDelete,
  sessionsMessagesSubscribe,
  sessionsMessagesUnsubscribe,
  modelsList,
  ChatMessage,
  AgentStreamPayload,
  ChatEventPayload,
  SessionInfo,
  ModelInfo,
} from './gateway-ws-client'
import { useGateway } from '@/components/GatewayProvider'
import { buildSessionKey, generateSessionContext } from './chat-session'
import { generateId } from './id'
import type { SessionStatus } from './agents/types'

// ── Helper: Extract text from message content ──────────────────────────

function extractTextFromContent(content: ChatMessage['content']): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: 'text'; text: string } =>
        block && block.type === 'text' && typeof block.text === 'string'
      )
      .map(block => block.text)
      .join('')
  }
  return ''
}

// ── Streaming Content Store (synchronous for real-time rendering) ──────────────────────────

type StreamingListener = () => void

const streamingListeners = new Set<StreamingListener>()
let streamingContentSnapshot: string | null = null

function getStreamingSnapshot(): string | null {
  return streamingContentSnapshot
}

function subscribeStreaming(listener: StreamingListener): () => void {
  streamingListeners.add(listener)
  return () => streamingListeners.delete(listener)
}

function setStreamingSnapshot(value: string | null): void {
  streamingContentSnapshot = value
  streamingListeners.forEach(listener => listener())
}

// Reset streaming state (called when run ends or new message starts)
function resetStreamingState(): void {
  streamingContentSnapshot = null
  streamingListeners.forEach(listener => listener())
}

// Hook for components to subscribe to streaming content
export function useStreamingContent(): string | null {
  return useSyncExternalStore(subscribeStreaming, getStreamingSnapshot, getStreamingSnapshot)
}

export interface UseChatOptions {
  agentId: string
  initialContext?: string
  initialSessionKey?: string // External session key control
}

export interface UseChatResult {
  messages: ChatMessage[]
  stream: string | null
  loading: boolean
  error: string | null
  status: SessionStatus
  runId: string | null
  sessionKey: string
  context: string
  setSessionKey: (key: string) => void
  sessions: SessionInfo[]
  sessionsLoading: boolean
  models: ModelInfo[]
  currentModel: string
  setModel: (modelId: string) => Promise<void>
  addContext: () => void
  removeContext: (sessionKey: string) => Promise<void>
  sendMessage: (message: string, attachments?: Array<{ type: string; mimeType: string; content: string }>) => Promise<void>
  abort: () => Promise<void>
  refresh: () => Promise<void>
}

export function useChat({ agentId, initialContext, initialSessionKey }: UseChatOptions): UseChatResult {
  const { isReady, isConnected } = useGateway()

  // Sessions for this agent (from gateway)
  const [sessions, setSessions] = useState<SessionInfo[]>([])

  // Available models
  const [models, setModels] = useState<ModelInfo[]>([])
  const [defaultModel, setDefaultModel] = useState<string>('')

  // Current session key (full key like "agent:worker_agent:subagent:uuid")
  // Can be controlled externally via initialSessionKey
  const [currentSessionKey, setCurrentSessionKey] = useState<string>(initialSessionKey || '')

  // Derive context from session key for display
  const context = currentSessionKey ? currentSessionKey.split(':').pop() || 'main' : 'main'

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)

  // Use currentSessionKey directly, fallback to built key if not set
  const sessionKey = currentSessionKey || buildSessionKey(agentId, context)

  // Get current model from session
  const currentSession = sessions.find(s => s.key === currentSessionKey)
  const currentModel = currentSession?.model || defaultModel || ''

  // Refs for event handling
  const currentSessionKeyRef = useRef(sessionKey)
  const currentRunIdRef = useRef<string | null>(null)
  const isRunningSessionRef = useRef(false) // Track if current session is running (re-subscribed)
  const lastSubscribedSessionKeyRef = useRef<string | null>(null) // Prevent duplicate subscribe calls
  const streamingContentRef = useRef<string | null>(null) // For accumulating streaming content
  const isFirstAssistantEventRef = useRef(false) // Track first assistant event after re-subscribe
  const sendingRef = useRef(false) // Track sending state for async operations

  // Keep sendingRef in sync with sending state
  useEffect(() => {
    sendingRef.current = sending
  }, [sending])

  useEffect(() => {
    currentSessionKeyRef.current = sessionKey
  }, [sessionKey])

  // Sync with external sessionKey prop
  useEffect(() => {
    if (initialSessionKey && initialSessionKey !== currentSessionKey) {
      setCurrentSessionKey(initialSessionKey)
    }
  }, [initialSessionKey, currentSessionKey])

  // Load available models
  const loadModels = useCallback(async () => {
    if (!isReady) return

    try {
      const result = await modelsList()
      setModels(result.models || [])
      setDefaultModel(result.default || '')
    } catch (err) {
      console.error('[useChat] loadModels error:', err)
    }
  }, [isReady])

  // Load sessions list from gateway
  const loadSessions = useCallback(async (isRefresh = false) => {
    if (!isReady) return

    if (!isRefresh) {
      setSessionsLoading(true)
    }
    try {
      const result = await sessionsList({ agentId, limit: 50 })
      const sessionList = result.sessions || []

      // Sort by updatedAt descending (most recent first)
      sessionList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

      // Smart update: only update if there are actual changes
      setSessions(prev => {
        // Check if anything changed
        const hasChanges = sessionList.length !== prev.length ||
          sessionList.some((newS, i) => {
            const oldS = prev[i]
            if (!oldS) return true
            // Compare key fields that affect rendering
            return newS.key !== oldS.key ||
              newS.status !== oldS.status ||
              newS.updatedAt !== oldS.updatedAt ||
              newS.model !== oldS.model ||
              newS.title !== oldS.title
          })

        return hasChanges ? sessionList : prev
      })

      // Only select session on initial load, not on refresh
      if (!isRefresh) {
        if (sessionList.length > 0) {
          setCurrentSessionKey(sessionList[0].key)
        } else {
          setCurrentSessionKey('')
        }
      }
    } catch (err) {
      console.error('[useChat] loadSessions error:', err)
    } finally {
      if (!isRefresh) {
        setSessionsLoading(false)
      }
    }
  }, [agentId, isReady])

  // Load chat history
  const loadHistory = useCallback(async (clearExisting = true) => {
    if (!isReady) return
    if (!sessionKey) return

    // Don't load history while streaming - it would overwrite the streaming content
    if (sendingRef.current) return

    if (clearExisting) {
      setLoading(true)
      setMessages([]) // Clear existing messages when loading new session
    }
    setError(null)
    try {
      const result = await chatHistory(sessionKey, 200)
      const msgs = result.messages || []

      // Double-check we're not streaming before updating messages
      // (the async call may have taken time and streaming started)
      if (!sendingRef.current) {
        setMessages(msgs)
      }
    } catch (err) {
      console.error('[useChat] loadHistory error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load history')
    } finally {
      if (clearExisting) {
        setLoading(false)
      }
    }
  }, [sessionKey, isReady])

  // Reset state when session changes
  useEffect(() => {
    resetStreamingState()
    streamingContentRef.current = null
    setSending(false)
    setRunId(null)
    currentRunIdRef.current = null
    setError(null)
    isRunningSessionRef.current = false
    isFirstAssistantEventRef.current = false
    lastSubscribedSessionKeyRef.current = null // Reset last subscribed session
  }, [sessionKey])

  // Reset state when agentId changes
  useEffect(() => {
    setCurrentSessionKey('')
    setSessions([])
    setMessages([])
    setLoading(true)
    setSessionsLoading(true)
    setError(null)
    setSending(false)
    resetStreamingState()
    streamingContentRef.current = null
    setRunId(null)
    currentRunIdRef.current = null
  }, [agentId])

  // Load sessions when agent changes or on initial mount
  useEffect(() => {
    if (isReady && isConnected) {
      loadSessions()
      loadModels()
    }
  }, [loadSessions, loadModels, isReady, isConnected])

  // Refresh sessions every 5 seconds to update status
  useEffect(() => {
    if (!isReady || !isConnected) return

    const interval = setInterval(() => {
      loadSessions(true) // true = refresh mode, no loading state
    }, 5000)

    return () => clearInterval(interval)
  }, [loadSessions, isReady, isConnected])

  // Load history when session changes
  useEffect(() => {
    if (isReady && isConnected) {
      loadHistory()
    }
  }, [loadHistory, isReady, isConnected])

  // Check running status and subscribe if needed
  useEffect(() => {
    if (!isReady || !sessionKey || sessionsLoading) return

    // Only process once per sessionKey
    if (lastSubscribedSessionKeyRef.current === sessionKey) return

    const currentSession = sessions.find(s => s.key === sessionKey)
    if (currentSession?.status === 'running') {
      setSending(true)
      isRunningSessionRef.current = true
      isFirstAssistantEventRef.current = true // Mark that next assistant event is the first after re-subscribe
      lastSubscribedSessionKeyRef.current = sessionKey

      // Re-subscribe to session messages after page refresh
      sessionsMessagesSubscribe(sessionKey).catch(err => {
        console.error('[useChat] sessionsMessagesSubscribe error:', err)
      })

      // Initialize streaming accumulator with existing partial content from last assistant message
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')
      if (lastAssistantMsg?.content && typeof lastAssistantMsg.content === 'string') {
        streamingContentRef.current = lastAssistantMsg.content
        setStreamingSnapshot(lastAssistantMsg.content)
      }
    }
  }, [sessions, sessionKey, sessionsLoading, isReady, messages])

  // Send message
  const sendMessage = useCallback(async (
    message: string,
    attachments?: Array<{ type: string; mimeType: string; content: string }>
  ) => {
    if (!isReady || sending) return

    const msg = message.trim()
    if (!msg && !attachments?.length) return

    // Add user message immediately
    const userMsg: ChatMessage = {
      role: 'user',
      content: msg,
    }
    setMessages(prev => [...prev, userMsg])

    setSending(true)
    setError(null)
    // Reset streaming state for new message (allows "Thinking..." to show)
    resetStreamingState()
    streamingContentRef.current = ''
    isRunningSessionRef.current = false // We have a new run with known runId
    isFirstAssistantEventRef.current = false // Normal run, not re-subscribe

    const idempotencyKey = generateId()

    try {
      const result = await chatSend({
        sessionKey,
        message: msg,
        attachments,
        idempotencyKey,
      })

      setRunId(result.runId)
      currentRunIdRef.current = result.runId
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
      setSending(false)
      resetStreamingState()
      streamingContentRef.current = null
    }
  }, [sessionKey, isReady, sending])

  // Abort current run
  const abort = useCallback(async () => {
    if (!isReady) {
      console.warn('[useChat] abort called but not ready')
      return
    }

    console.log('[useChat] abort called for session:', sessionKey)

    try {
      // Abort without runId - gateway will abort the current run for this session
      await chatAbort(sessionKey)
      console.log('[useChat] chatAbort completed')

      // If this was a re-subscribed running session, unsubscribe now
      if (isRunningSessionRef.current) {
        await sessionsMessagesUnsubscribe(sessionKey).catch(err => {
          console.error('[useChat] sessionsMessagesUnsubscribe error:', err)
        })
      }

      setSending(false)
      setRunId(null)
      currentRunIdRef.current = null
      isRunningSessionRef.current = false
      lastSubscribedSessionKeyRef.current = null
      isFirstAssistantEventRef.current = false
    } catch (err) {
      console.error('[useChat] abort error:', err)
      setError(err instanceof Error ? err.message : 'Failed to abort')
    }
  }, [sessionKey, isReady])

  // Add new session (create new context)
  const addContext = useCallback(() => {
    const newContext = generateSessionContext()
    const newSessionKey = buildSessionKey(agentId, newContext)

    // Add new session to the list
    const newSession: SessionInfo = {
      key: newSessionKey,
      updatedAt: Date.now(),
    }

    setSessions(prev => [newSession, ...prev])
    setCurrentSessionKey(newSessionKey)
  }, [agentId])

  // Remove context - delete session and switch to another
  const removeContext = useCallback(async (sessionKeyToRemove: string) => {
    if (!isReady) return

    try {
      await sessionsDelete(sessionKeyToRemove)

      // Remove from local list
      setSessions(prev => prev.filter(s => s.key !== sessionKeyToRemove))

      // Switch to another session if needed
      if (currentSessionKey === sessionKeyToRemove) {
        const remaining = sessions.filter(s => s.key !== sessionKeyToRemove)
        if (remaining.length > 0) {
          setCurrentSessionKey(remaining[0].key)
        }
      }
    } catch (err) {
      console.error('[useChat] removeContext error:', err)
      throw err
    }
  }, [sessions, currentSessionKey, isReady])

  // Set session by key
  const handleSetContext = useCallback((key: string) => {
    setCurrentSessionKey(key)
  }, [])

  // Set model for current session
  const setModel = useCallback(async (modelId: string) => {
    if (!currentSessionKey || !isReady) return

    try {
      await sessionsPatch(currentSessionKey, { model: modelId })
      // Update local session state
      setSessions(prev => prev.map(s =>
        s.key === currentSessionKey ? { ...s, model: modelId } : s
      ))
    } catch (err) {
      console.error('[useChat] setModel error:', err)
      setError(err instanceof Error ? err.message : 'Failed to set model')
    }
  }, [currentSessionKey, isReady])

  return {
    messages,
    stream: streamingContentRef.current,
    loading,
    error,
    status: 'idle' as SessionStatus, // useChat is deprecated, use useAgentChat instead
    runId,
    sessionKey,
    context,
    setSessionKey: handleSetContext,
    sessions,
    sessionsLoading,
    models,
    currentModel,
    setModel,
    addContext,
    removeContext,
    sendMessage,
    abort,
    refresh: loadHistory,
  }
}