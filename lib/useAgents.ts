'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agent } from '@/lib/types'
import { agentsList, agentIdentityGet, getConnectionState, onConnectionStateChange } from './gateway-ws-client'
import { useGateway } from '@/components/GatewayProvider'

// Color palette for agents without configured colors
const AGENT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

export interface UseAgentsResult {
  agents: Agent[]
  loading: boolean
  error: string | null
  /** Force an immediate full refetch */
  refresh: () => void
  /** Timestamp of last successful fetch */
  lastUpdated: number | null
}

export function useAgents(): UseAgentsResult {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const fetchingRef = useRef(false)
  const { isReady } = useGateway()

  // Fetch agents via WebSocket
  const fetchAgents = useCallback(async () => {
    // Prevent duplicate calls
    if (fetchingRef.current) return
    fetchingRef.current = true

    try {
      setLoading(true)
      const gatewayAgents = await agentsList()
      const agentList = Array.isArray(gatewayAgents) ? gatewayAgents : []

      // Fetch identity for each agent (in parallel for speed)
      const identityPromises = agentList.map(async (ga, index) => {
        const gaObj = ga as Record<string, unknown>
        const agentId = String(gaObj.id || '')

        // Get identity (avatar) from gateway
        const identity = await agentIdentityGet(agentId)

        return {
          id: agentId,
          name: identity?.name || String(gaObj.name || gaObj.id || ''),
          avatar: identity?.avatar || '🤖',
          model: typeof gaObj.model === 'string' ? gaObj.model : null,
          color: AGENT_COLORS[index % AGENT_COLORS.length],
        }
      })

      const identityResults = await Promise.all(identityPromises)

      // Transform to Agent type
      const transformed: Agent[] = identityResults.map(r => ({
        id: r.id,
        name: r.name,
        title: 'Agent',
        reportsTo: null,
        directReports: [],
        soulPath: null,
        soul: null,
        voiceId: null,
        color: r.color,
        emoji: r.avatar,
        tools: [],
        model: r.model,
        memoryPath: null,
        description: '',
        crons: [],
      }))

      setAgents(transformed)
      setError(null)
      setLastUpdated(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [])

  const refresh = useCallback(() => {
    fetchAgents()
  }, [fetchAgents])

  // Wait for isReady before fetching, then refetch on connection
  useEffect(() => {
    // Don't fetch until gateway is ready (token set)
    if (!isReady) return

    fetchAgents()

    // Subscribe to connection state changes - refetch when connected
    const unsubscribe = onConnectionStateChange((state) => {
      if (state === 'connected') {
        fetchAgents()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [fetchAgents, isReady])

  return { agents, loading, error, refresh, lastUpdated }
}
