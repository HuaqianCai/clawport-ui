'use client'
import { useState, useCallback } from 'react'
import type { MediaAttachment } from '@/lib/conversations'
import { fileToAttachment } from './MediaUtils'

export interface UseDragDropResult {
  isDragOver: boolean
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => Promise<void>
}

export function useDragDrop(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onFiles: (attachments: MediaAttachment[]) => void
): UseDragDropResult {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only leave if we're actually leaving the container
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      const { clientX, clientY } = e
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        setIsDragOver(false)
      }
    }
  }, [containerRef])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const newAttachments: MediaAttachment[] = []
    for (let i = 0; i < files.length; i++) {
      newAttachments.push(await fileToAttachment(files[i]))
    }
    onFiles(newAttachments)
  }, [onFiles])

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}

/* ── Clipboard paste handler ─────────────────────────────────────── */

export async function handlePasteImage(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  onFiles: (attachments: MediaAttachment[]) => void
): Promise<boolean> {
  const items = e.clipboardData?.items
  if (!items) return false

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      e.preventDefault()
      const file = items[i].getAsFile()
      if (file) {
        const att = await fileToAttachment(file)
        onFiles([att])
      }
      return true
    }
  }
  return false
}