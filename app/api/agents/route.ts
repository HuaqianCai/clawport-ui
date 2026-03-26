import { agentsList } from '@/lib/gateway-websocket'
import { apiErrorResponse } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import type { Agent } from '@/lib/types'

export async function GET() {
  try {
    // Get agents from gateway
    const gatewayAgents = await agentsList()
    const agentList = Array.isArray(gatewayAgents) ? gatewayAgents : []

    // Transform to Agent format with defaults for UI
    const agents: Agent[] = agentList.map(ga => {
      const gaObj = ga as Record<string, unknown>
      return {
        id: String(gaObj.id || ''),
        name: String(gaObj.name || gaObj.id || ''),
        title: 'Agent',
        reportsTo: null,
        directReports: [],
        soulPath: null,
        soul: null,
        voiceId: null,
        color: '#6b7280',
        emoji: '🤖',
        tools: [],
        model: typeof gaObj.model === 'string' ? gaObj.model : null,
        memoryPath: null,
        description: '',
        crons: [],
      }
    })

    return NextResponse.json(agents)
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load agents')
  }
}
