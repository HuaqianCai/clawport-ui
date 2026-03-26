/**
 * Hook to get chat state for a specific agent from the global ChatManager.
 *
 * This provides a compatibility layer between the global useChatManager
 * and the per-agent UseChatResult interface.
 */

'use client'

import { useCallback, useMemo, useRef, useEffect } from 'react'
import { useChatManagerContext } from '@/components/ChatManagerProvider'
import { useGateway } from '@/components/GatewayProvider'
import { sessionsPatch } from '@/lib/gateway-ws-client'
import { buildSessionKey, generateSessionContext, parseAgentId, WsMessage } from './types'
import type { SessionInfo, ChatMessage } from '@/lib/gateway-ws-client'
import type { UseChatResult } from '@/lib/useChat'

/** Convert WsMessage to ChatMessage */
function toChatMessage(msg: WsMessage): ChatMessage {
  // Map system role to assistant (system messages are display-only)
  const role: 'user' | 'assistant' | 'toolResult' =
    msg.role === 'system' ? 'assistant' : msg.role

  return {
    role,
    content: typeof msg.content === 'string' ? msg.content : msg.content as ChatMessage['content'],
    timestamp: msg.timestamp,
    toolName: msg.toolName,
    isError: msg.isError,
    provenance: msg.provenance,
  }
}

interface UseAgentChatOptions {
  agentId: string
}

/**
 * Hook to get chat state for a specific agent.
 * Returns an interface compatible with the old useChat hook.
 */
export function useAgentChat({ agentId }: UseAgentChatOptions): UseChatResult {
  const manager = useChatManagerContext()
  const { isReady } = useGateway()

  // Get sessions for this agent from agentViews
  // Use manager.agentViews directly in useMemo dependency to ensure re-render
  const sessions: SessionInfo[] = useMemo(() => {
    const agentView = manager.agentViews.get(agentId)
    if (!agentView) return []
    return agentView.sessions.map(s => ({
      key: s.key,
      kind: s.kind,
      chatType: s.chatType,
      updatedAt: s.updatedAt,
      model: s.model,
      sessionId: s.sessionId,
      // Map SessionMeta.status to SessionInfo.status
      status: s.status === 'running' ? 'running' as const : undefined,
      title: s.title,
      label: s.label,
    }))
  }, [manager.agentViews, agentId])

  // Get agentView for other computations
  const agentView = manager.agentViews.get(agentId)

  // Determine active session for this agent
  const activeSessionKey = manager.activeSessionKey && parseAgentId(manager.activeSessionKey) === agentId
    ? manager.activeSessionKey
    : agentView?.selectedSessionKey || null

  // Get state for active session
  const sessionState = activeSessionKey ? manager.activeSessionState : null

  // Auto-select session when agent changes or on initial load
  useEffect(() => {
    // Skip if no sessions available
    if (!agentView || agentView.sessions.length === 0) return

    // Check if manager's activeSessionKey belongs to this agent
    const managerActiveBelongsToAgent = manager.activeSessionKey && parseAgentId(manager.activeSessionKey) === agentId

    // If manager's active session already belongs to this agent, no need to select
    if (managerActiveBelongsToAgent) return

    // Select the most recent session for this agent
    const sorted = [...agentView.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    const latestSession = sorted[0]
    if (latestSession) {
      console.log('[useAgentChat] Auto-selecting latest session for agent:', agentId, latestSession.key)
      manager.selectSession(latestSession.key).catch(err => {
        console.error('[useAgentChat] Auto-select error:', err)
      })
    }
  }, [agentId, agentView, manager.activeSessionKey, manager])

  // Models (fetched separately per agent for now)
  // Note: models are global, so we just return them

  // Select a session for this agent
  const setSessionKey = useCallback(async (sessionKey: string) => {
    await manager.selectSession(sessionKey)
  }, [manager])

  // Add new session (create new context)
  const addContext = useCallback(() => {
    const newContext = generateSessionContext()
    const newSessionKey = buildSessionKey(agentId, newContext)
    // The session will be created when we select it
    manager.selectSession(newSessionKey)
  }, [agentId, manager])

  // Remove session
  const removeContext = useCallback(async (sessionKeyToRemove: string) => {
    await manager.deleteSession(sessionKeyToRemove)
  }, [manager])

  // Send message
  const sendMessage = useCallback(async (
    message: string,
    attachments?: Array<{ type: string; mimeType: string; content: string }>
  ) => {
    // Ensure we have a session selected
    if (!activeSessionKey) {
      // Create new session if none exists
      const newContext = generateSessionContext()
      const newSessionKey = buildSessionKey(agentId, newContext)
      await manager.selectSession(newSessionKey)
      await manager.sendMessage(message, attachments?.map(a => ({
        mimeType: a.mimeType,
        dataUrl: `data:${a.mimeType};base64,${a.content}`,
      })))
    } else {
      await manager.sendMessage(message, attachments?.map(a => ({
        mimeType: a.mimeType,
        dataUrl: `data:${a.mimeType};base64,${a.content}`,
      })))
    }
  }, [agentId, activeSessionKey, manager])

  // Abort
  const abort = useCallback(async () => {
    await manager.abort()
  }, [manager])

  // Refresh history
  const refresh = useCallback(async () => {
    await manager.refreshHistory()
  }, [manager])

  // Set model for current session
  const setModel = useCallback(async (modelId: string) => {
    if (!activeSessionKey || !isReady) return

    try {
      await sessionsPatch(activeSessionKey, { model: modelId })
    } catch (err) {
      console.error('[useAgentChat] setModel error:', err)
    }
  }, [activeSessionKey, isReady])

  // Derive context from session key
  const context = activeSessionKey ? activeSessionKey.split(':').pop() || 'main' : 'main'

  return {
    messages: (sessionState?.messages || []).map(toChatMessage),
    stream: sessionState?.stream || null,
    loading: !sessionState && !activeSessionKey,
    error: sessionState?.error || null,
    status: sessionState?.status || 'idle',
    runId: sessionState?.runId || null,
    sessionKey: activeSessionKey || buildSessionKey(agentId, context),
    context,
    setSessionKey,
    sessions,
    sessionsLoading: !agentView,
    models: [], // Models loaded separately
    currentModel: sessions.find(s => s.key === activeSessionKey)?.model || '',
    setModel,
    addContext,
    removeContext,
    sendMessage,
    abort,
    refresh,
  }
}