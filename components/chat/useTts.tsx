'use client'
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

export interface UseTtsResult {
  ttsLoadingId: string | null
  ttsPlayingId: string | null
  playTts: (msgId: string, text: string) => Promise<void>
  stopTts: () => void
  speakerPlayIcon: React.ReactNode
  speakerStopIcon: React.ReactNode
}

export function useTts(): UseTtsResult {
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null)
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsObjectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      ttsAudioRef.current?.pause()
      if (ttsObjectUrlRef.current) URL.revokeObjectURL(ttsObjectUrlRef.current)
    }
  }, [])

  const stopTts = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current.currentTime = 0
      ttsAudioRef.current = null
    }
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current)
      ttsObjectUrlRef.current = null
    }
    setTtsPlayingId(null)
    setTtsLoadingId(null)
  }, [])

  const playTts = useCallback(async (msgId: string, text: string) => {
    if (ttsPlayingId === msgId) { stopTts(); return }
    stopTts()
    setTtsLoadingId(msgId)

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error('TTS request failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      ttsObjectUrlRef.current = url

      const audio = new Audio(url)
      ttsAudioRef.current = audio

      audio.onended = () => {
        setTtsPlayingId(null)
        ttsAudioRef.current = null
        if (ttsObjectUrlRef.current) {
          URL.revokeObjectURL(ttsObjectUrlRef.current)
          ttsObjectUrlRef.current = null
        }
      }
      audio.onerror = () => stopTts()

      await audio.play()
      setTtsLoadingId(null)
      setTtsPlayingId(msgId)
    } catch {
      stopTts()
    }
  }, [ttsPlayingId, stopTts])

  const speakerPlayIcon = useMemo(() => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ), [])

  const speakerStopIcon = useMemo(() => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ), [])

  return {
    ttsLoadingId,
    ttsPlayingId,
    playTts,
    stopTts,
    speakerPlayIcon,
    speakerStopIcon,
  }
}