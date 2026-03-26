/**
 * Chat session types and utilities for multi-session state management
 */

// ============ Session Key Utilities ============

export interface ChatSession {
  key: string
  agentId: string
  context: string
  label?: string
}

/**
 * Parse a session key into its components.
 */
export function parseSessionKey(sessionKey: string): ChatSession | null {
  const match = sessionKey.match(/^agent:([^:]+):(.+)$/)
  if (!match) return null
  return {
    key: sessionKey,
    agentId: match[1],
    context: match[2],
  }
}

/**
 * Build a session key from agent ID and context.
 */
export function buildSessionKey(agentId: string, context: string = 'main'): string {
  return `agent:${agentId}:${context}`
}

/**
 * Get default session key for an agent.
 */
export function getDefaultSessionKey(agentId: string): string {
  return buildSessionKey(agentId, 'main')
}

/**
 * Generate a unique context for a new session.
 */
export function generateSessionContext(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return `${month}-${day}-${suffix}`
}

/**
 * Default session contexts for an agent.
 */
export const DEFAULT_SESSION_CONTEXTS = ['main'] as const

/**
 * Generate display label for a session context.
 */
export function getSessionLabel(context: string): string {
  if (context === 'main') return 'Main'
  return context.charAt(0).toUpperCase() + context.slice(1)
}

// ============ UI Layer Types ============

/** Session 元数据（来自 sessions.list，所有 session 都有）*/
export interface SessionMeta {
  key: string
  agentId: string
  status: 'idle' | 'running' | 'waiting'
  updatedAt: number
  model?: string
  sessionId?: string
  kind?: string
  chatType?: string
  title?: string
  label?: string
}

/** Agent 视图状态 */
export interface AgentViewState {
  agentId: string
  sessions: SessionMeta[]
  selectedSessionKey: string | null
}

// ============ State Layer Types ============

/** Session 运行状态 */
export type SessionStatus =
  | 'idle'       // 空闲
  | 'resuming'   // 恢复中：重新订阅正在运行的 session
  | 'running'    // 运行中：发送新消息后等待/接收响应
  | 'completed'  // 完成
  | 'error'      // 出错

/** 事件来源类型 */
export type EventSource = 'chat' | 'agent' | null

/** Session 完整状态（只有用户选中过才有）*/
export interface SessionState {
  sessionKey: string
  messages: WsMessage[]
  stream: string | null
  runId: string | null
  status: SessionStatus
  eventSource: EventSource  // 当前运行的事件来源
  lastAccessedAt: number
  error: string | null
}

/** WebSocket 消息 */
export interface WsMessage {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'toolResult'
  content: string | ContentBlock[]
  timestamp: number
  toolName?: string
  isError?: boolean
  provenance?: MessageProvenance
}

/** 内容块 */
export interface ContentBlock {
  type: 'text' | 'image' | 'toolCall' | 'toolResult'
  text?: string
  name?: string
  args?: Record<string, unknown>
  source?: { type: string; media_type: string; data: string }
}

/** 消息来源 */
export interface MessageProvenance {
  kind?: string
  sourceSessionKey?: string
  sourceChannel?: string
  sourceTool?: string
}

/** 附件 */
export interface Attachment {
  mimeType: string
  dataUrl: string
  name?: string
}

// ============ Global Config ============

export interface ChatGlobalConfig {
  maxSessionStates: number
  pollIntervalMs: number
}

export const DEFAULT_CHAT_CONFIG: ChatGlobalConfig = {
  maxSessionStates: 10,
  pollIntervalMs: 5000
}

// ============ Utility Functions ============

/** 从 sessionKey 解析 agentId */
export function parseAgentId(sessionKey: string): string {
  const parsed = parseSessionKey(sessionKey)
  return parsed?.agentId || 'main'
}

/** 从 sessions.list 响应解析 SessionMeta 数组 */
export function parseSessionMetas(sessions: Array<Record<string, unknown>>): SessionMeta[] {
  return sessions.map(s => ({
    key: String(s.key || ''),
    agentId: parseAgentId(String(s.key || '')),
    status: (s.status as SessionMeta['status']) || 'idle',
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
    model: typeof s.model === 'string' ? s.model : undefined,
    sessionId: typeof s.sessionId === 'string' ? s.sessionId : undefined,
    kind: typeof s.kind === 'string' ? s.kind : undefined,
    chatType: typeof s.chatType === 'string' ? s.chatType : undefined
  }))
}

/** 按 agentId 分组 sessions */
export function groupSessionsByAgent(metas: SessionMeta[]): Map<string, SessionMeta[]> {
  const byAgent = new Map<string, SessionMeta[]>()
  for (const meta of metas) {
    if (!byAgent.has(meta.agentId)) {
      byAgent.set(meta.agentId, [])
    }
    byAgent.get(meta.agentId)!.push(meta)
  }
  return byAgent
}

/** 智能合并：只更新变化的 session */
export function mergeSessionMetas(
  oldList: SessionMeta[],
  newList: SessionMeta[]
): SessionMeta[] {
  const oldMap = new Map(oldList.map(s => [s.key, s]))
  return newList.map(newS => {
    const oldS = oldMap.get(newS.key)
    if (
      oldS &&
      oldS.status === newS.status &&
      oldS.updatedAt === newS.updatedAt
    ) {
      return oldS
    }
    return newS
  })
}

// ============ Message Processing ============

const SILENT_REPLY_PATTERN = /^\s*NO_REPLY\s*$/i

export function isSilentReply(text: string): boolean {
  return SILENT_REPLY_PATTERN.test(text)
}

export function isSilentReplyMessage(message: WsMessage): boolean {
  if (message.role !== 'assistant') return false
  const text = extractTextFromContent(message.content)
  return isSilentReply(text)
}

export function extractTextFromContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content
  const textBlock = content.find(b => b.type === 'text' && b.text)
  return textBlock?.text || ''
}

export function normalizeMessage(raw: Record<string, unknown>): WsMessage {
  const role = normalizeRole(raw.role)
  const content = normalizeContent(raw.content, raw.text)
  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    role,
    content,
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
    toolName: typeof raw.toolName === 'string' ? raw.toolName : undefined,
    isError: typeof raw.isError === 'boolean' ? raw.isError : undefined,
    provenance: raw.provenance as MessageProvenance | undefined
  }
}

function normalizeRole(role: unknown): WsMessage['role'] {
  if (typeof role !== 'string') return 'user'
  const r = role.toLowerCase()
  if (r === 'user') return 'user'
  if (r === 'assistant') return 'assistant'
  if (r === 'system') return 'system'
  if (r === 'tool' || r === 'toolresult' || r === 'tool_result') return 'toolResult'
  return 'user'
}

function normalizeContent(
  content: unknown,
  text?: unknown
): string | ContentBlock[] {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(b => ({
      type: (b.type as ContentBlock['type']) || 'text',
      text: typeof b.text === 'string' ? b.text : undefined,
      name: typeof b.name === 'string' ? b.name : undefined,
      args: b.args || b.arguments,
      source: b.source
    })) as ContentBlock[]
  }
  if (typeof text === 'string') return text
  return ''
}