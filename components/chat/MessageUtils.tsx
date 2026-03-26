import type { Message } from '@/lib/conversations'

/* ── Timestamp formatting ───────────────────────────────────────────── */

export function formatTimestamp(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const isToday = now.toDateString() === date.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = yesterday.toDateString() === date.toDateString()
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  if (isToday) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`
}

/* ── Time ago formatter (for session lists) ────────────────────────── */

export function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

/* ── Short time formatter (for chat headers) ───────────────────────── */

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/* ── Message display helpers ──────────────────────────────────────── */

export function shouldShowTimestamp(messages: Message[], index: number): boolean {
  if (messages[index].role === 'system') return false
  // Find previous non-system message for gap comparison
  let prev = index - 1
  while (prev >= 0 && messages[prev].role === 'system') prev--
  if (prev < 0) return true
  const gap = messages[index].timestamp - messages[prev].timestamp
  return gap > 5 * 60 * 1000 // 5 minutes
}

export function shouldShowAvatar(messages: Message[], index: number): boolean {
  if (messages[index].role === 'system') return false
  // Find previous non-system message for role comparison
  let prev = index - 1
  while (prev >= 0 && messages[prev].role === 'system') prev--
  if (prev < 0) return true
  return messages[prev].role !== messages[index].role
}