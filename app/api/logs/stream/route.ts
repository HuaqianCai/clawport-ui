import { subscribeStream } from '@/lib/gateway-websocket'
import type { RpcResponse } from '@/lib/gateway-websocket'

const MAX_LIFETIME_MS = 10 * 60 * 1000 // 10 minutes
const HEARTBEAT_INTERVAL_MS = 15 * 1000 // 15 seconds

export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let lifetime: ReturnType<typeof setTimeout> | null = null
  let releaseStream: (() => void) | null = null

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Subscribe to logs.tail via WebSocket RPC
        releaseStream = await subscribeStream('logs.tail', {}, (event: RpcResponse) => {
          try {
            const data = event.params ?? event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch {
            // Controller may be closed
          }
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to subscribe to logs'
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`))
        controller.close()
        return
      }

      // Heartbeat to prevent proxy timeouts
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          // Controller may be closed
        }
      }, HEARTBEAT_INTERVAL_MS)

      // Max lifetime safety valve
      lifetime = setTimeout(() => {
        cleanup()
        try {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Stream max lifetime reached' })}\n\n`))
          controller.close()
        } catch {
          // Already closed
        }
      }, MAX_LIFETIME_MS)

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        cleanup()
        try { controller.close() } catch { /* already closed */ }
      })

      function cleanup() {
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
        if (lifetime) { clearTimeout(lifetime); lifetime = null }
        if (releaseStream) {
          releaseStream()
          releaseStream = null
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}