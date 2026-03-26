/**
 * Agents module - multi-session chat state management
 *
 * Architecture:
 * - UI Layer: agentViews (from sessions.list polling) - renders left sidebar
 * - State Layer: sessionStates (lazy-created on select) - manages chat content
 */

// Re-export everything from sub-modules
export * from './types'
export * from './manager'
export { useAgentChat } from './use-agent-chat'