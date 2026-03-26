/**
 * Chat Manager Context Provider
 *
 * Provides global chat state management for all agents and sessions.
 */

'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useChatManager } from '@/lib/agents/manager'
import type { UseChatManagerReturn } from '@/lib/agents/manager'

// ============ Context ============

const ChatManagerContext = createContext<UseChatManagerReturn | null>(null)

// ============ Provider ============

interface ChatManagerProviderProps {
  children: ReactNode
}

export function ChatManagerProvider({ children }: ChatManagerProviderProps) {
  const manager = useChatManager()

  return (
    <ChatManagerContext.Provider value={manager}>
      {children}
    </ChatManagerContext.Provider>
  )
}

// ============ Hook ============

/**
 * Hook to access the global chat manager.
 * Must be used within ChatManagerProvider.
 */
export function useChatManagerContext(): UseChatManagerReturn {
  const context = useContext(ChatManagerContext)
  if (!context) {
    throw new Error('useChatManagerContext must be used within ChatManagerProvider')
  }
  return context
}

// ============ Re-export types ============

export type { UseChatManagerReturn } from '@/lib/agents/manager'
export type {
  SessionMeta,
  SessionState,
  AgentViewState,
  WsMessage,
  ContentBlock,
  Attachment,
} from '@/lib/agents/types'