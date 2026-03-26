'use client'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { Agent } from '@/lib/types'
import type { Conversation, ConversationStore, Message, MediaAttachment } from '@/lib/conversations'
import { addMessage, updateLastMessage, deleteOnServer } from '@/lib/conversations'
import { buildApiContent } from '@/lib/multimodal'
import { generateId } from '@/lib/id'
import { useSettings } from '@/app/settings-provider'
import { parseSlashCommand, executeCommand } from '@/lib/slash-commands'
import type { SlashCommand } from '@/lib/slash-commands'
import { ChatHeader } from './ChatHeader'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { useDragDrop, handlePasteImage } from './useDragDrop'

interface ConversationViewProps {
  agent: Agent
  conversation: Conversation
  onUpdate: (agentId: string, updater: (prev: ConversationStore) => ConversationStore) => void
  onBack?: () => void
}

export function ConversationView({ agent, conversation, onUpdate, onBack }: ConversationViewProps) {
  const { settings } = useSettings()
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<MediaAttachment[]>([])
  const [slashMatches, setSlashMatches] = useState<SlashCommand[]>([])
  const [slashIndex, setSlashIndex] = useState(0)
  const messagesAreaRef = useRef<HTMLDivElement>(null)

  const messages = conversation?.messages || []
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Drag and drop
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(
    messagesAreaRef,
    (attachments) => setPendingAttachments(prev => [...prev, ...attachments])
  )

  // Send message via streaming API
  const sendMessage = useCallback(async (mediaOverride?: MediaAttachment[], contentOverride?: string) => {
    const mediaToSend = mediaOverride || [...pendingAttachments]
    const hasText = input.trim().length > 0 || !!contentOverride
    const hasMedia = mediaToSend.length > 0

    if ((!hasText && !hasMedia) || isStreaming) return

    const text = contentOverride || input.trim()
    setInput('')
    setPendingAttachments([])

    let content = text
    if (!content && hasMedia) {
      const labels = mediaToSend.map(m => `[${m.name || m.type}]`)
      content = labels.join(' ')
    }

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      media: hasMedia ? mediaToSend : undefined,
    }

    const assistantMsgId = generateId()
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }

    onUpdate(agent.id, prev => {
      let next = addMessage(prev, agent.id, userMsg)
      next = addMessage(next, agent.id, assistantMsg)
      return next
    })

    setIsStreaming(true)

    const apiMessages = [...messagesRef.current, userMsg]
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: buildApiContent(m),
      }))

    try {
      const res = await fetch(`/api/chat/${agent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, operatorName: settings.operatorName }),
      })

      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const chunk = JSON.parse(line.slice(6))
              if (chunk.content) {
                fullContent += chunk.content
                const capturedContent = fullContent
                onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, capturedContent, true))
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }

      onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, fullContent, false))
    } catch {
      onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, 'Error getting response. Check API connection.', false))
    } finally {
      setIsStreaming(false)
    }
  }, [input, pendingAttachments, isStreaming, agent.id, onUpdate, settings.operatorName])

  // Slash command handling
  function runSlashCommand(command: string) {
    const result = executeCommand(command, agent)
    if (result.action === 'clear') {
      clearChat()
    } else {
      const sysMsg: Message = {
        id: generateId(),
        role: 'system',
        content: result.content,
        timestamp: Date.now(),
      }
      onUpdate(agent.id, prev => addMessage(prev, agent.id, sysMsg))
    }
    setInput('')
    setSlashMatches([])
  }

  function handleSlashSelect(cmd: SlashCommand) {
    runSlashCommand(cmd.name)
  }

  function handleSend() {
    const parsed = parseSlashCommand(input)
    if (parsed) {
      runSlashCommand(parsed.command)
    } else {
      sendMessage()
    }
  }

  function clearChat() {
    deleteOnServer(agent.id)
    onUpdate(agent.id, prev => ({
      ...prev,
      [agent.id]: {
        agentId: agent.id,
        messages: [{
          id: generateId(),
          role: 'assistant' as const,
          content: `I'm ${agent.name}. ${agent.description} What do you need?`,
          timestamp: Date.now(),
        }],
        unread: 0,
        lastActivity: Date.now(),
      }
    }))
  }

  // Wrapper for paste handling
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    await handlePasteImage(e, (atts) => setPendingAttachments(prev => [...prev, ...atts]))
  }, [])

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
    }}>
      <ChatHeader
        agent={agent}
        messagesCount={messages.length}
        onBack={onBack}
        onClear={clearChat}
      />

      <MessageList
        agent={agent}
        messages={messages}
        isStreaming={isStreaming}
        isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />

      <ChatInput
        agent={agent}
        input={input}
        setInput={setInput}
        isStreaming={isStreaming}
        pendingAttachments={pendingAttachments}
        setPendingAttachments={setPendingAttachments}
        slashMatches={slashMatches}
        setSlashMatches={setSlashMatches}
        slashIndex={slashIndex}
        setSlashIndex={setSlashIndex}
        onSend={handleSend}
        onSlashSelect={handleSlashSelect}
      />
    </div>
  )
}