/**
 * WebSocket-based chat view component.
 * Uses gateway chat.send/chat.history/sessions.list APIs.
 */

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import type { Agent } from '@/lib/types'
import type { UseChatResult } from '@/lib/useChat'
import { matchCommands, parseSlashCommand, executeCommand, isSlashInput } from '@/lib/slash-commands'
import type { SlashCommand } from '@/lib/slash-commands'
import { WsChatHeader } from './WsChatHeader'
import { WsMessageArea } from './WsMessageArea'
import { WsInputArea } from './WsInputArea'

interface WebSocketChatViewProps {
  agent: Agent
  chat: UseChatResult
  onBack?: () => void
}

export function WebSocketChatView({ agent, chat, onBack }: WebSocketChatViewProps) {
  const {
    messages,
    stream,
    loading,
    error,
    status,
    models,
    currentModel,
    setModel,
    sendMessage,
    abort,
  } = chat

  const isRunning = status === 'running' || status === 'resuming'

  const [input, setInput] = useState('')
  const [showCommands, setShowCommands] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)

  // Matched slash commands
  const matchedCommands = useMemo(() => {
    if (!isSlashInput(input)) return []
    return matchCommands(input)
  }, [input])

  // Show command menu when typing /
  useEffect(() => {
    setShowCommands(matchedCommands.length > 0)
    setSelectedCommandIndex(0)
  }, [matchedCommands.length])

  // Handle send (or execute command)
  const handleSend = useCallback(() => {
    const msg = input.trim()
    if (!msg || isRunning) return

    const parsed = parseSlashCommand(msg)
    if (parsed) {
      executeCommand(parsed.command, agent)
      setInput('')
      setShowCommands(false)
      return
    }

    setInput('')
    setShowCommands(false)
    sendMessage(msg)
  }, [input, isRunning, sendMessage, agent])

  function handleCommandSelect(cmd: SlashCommand) {
    setInput(cmd.name + ' ')
    setShowCommands(false)
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
    }}>
      <WsChatHeader
        agent={agent}
        onBack={onBack}
        models={models}
        currentModel={currentModel}
        onModelChange={setModel}
      />

      <WsMessageArea
        agent={agent}
        messages={messages}
        loading={loading}
        error={error}
        sending={isRunning}
        streamingContent={stream}
      />

      <WsInputArea
        agent={agent}
        input={input}
        setInput={setInput}
        sending={isRunning}
        showCommands={showCommands}
        matchedCommands={matchedCommands}
        selectedCommandIndex={selectedCommandIndex}
        onSend={handleSend}
        onAbort={abort}
        onCommandSelect={handleCommandSelect}
        setSelectedCommandIndex={setSelectedCommandIndex}
        setShowCommands={setShowCommands}
      />
    </div>
  )
}