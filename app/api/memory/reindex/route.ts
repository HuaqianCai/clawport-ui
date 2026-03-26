import { NextResponse } from 'next/server'
import { memoryReindex } from '@/lib/gateway-websocket'

export async function POST() {
  try {
    const result = await memoryReindex()
    return NextResponse.json({
      status: 'success',
      message: typeof result === 'string' ? result : 'Reindex completed',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reindex failed'
    return NextResponse.json({
      status: 'failed',
      message,
      timestamp: new Date().toISOString(),
    })
  }
}
