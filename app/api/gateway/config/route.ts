import { NextResponse } from 'next/server'
import { gatewayToken, gatewayPort } from '@/lib/env'

/**
 * Get gateway configuration for frontend WebSocket connection.
 *
 * This endpoint exposes the gateway token and port so the frontend
 * can establish a direct WebSocket connection to the OpenClaw gateway.
 *
 * Security: This is safe for local development where ClawPort runs
 * on the same machine as OpenClaw gateway.
 */
export async function GET() {
  const token = gatewayToken()
  const port = gatewayPort()

  if (!token) {
    return NextResponse.json(
      { error: 'Gateway token not configured' },
      { status: 503 }
    )
  }

  return NextResponse.json({
    token,
    port,
    url: `ws://localhost:${port}/ws`,
  })
}