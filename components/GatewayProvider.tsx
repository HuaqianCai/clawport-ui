'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  setGatewayToken,
  setGatewayPort,
  connect,
  disconnect,
  getConnectionState,
  onConnectionStateChange,
  sessionsSubscribe,
  type ConnectionState,
} from '@/lib/gateway-ws-client'

interface GatewayConfig {
  token: string
  port: number
  url: string
}

interface GatewayContextValue {
  state: ConnectionState
  isConnected: boolean
  isReady: boolean // Config loaded, token set, ready for RPC calls
  connect: () => Promise<void>
  disconnect: () => void
  config: GatewayConfig | null
  error: Error | null
}

const GatewayContext = createContext<GatewayContextValue | null>(null)

export function useGateway() {
  const ctx = useContext(GatewayContext)
  if (!ctx) {
    throw new Error('useGateway must be used within a GatewayProvider')
  }
  return ctx
}

interface GatewayProviderProps {
  children: ReactNode
}

export function GatewayProvider({ children }: GatewayProviderProps) {
  const [state, setState] = useState<ConnectionState>('disconnected')
  const [config, setConfig] = useState<GatewayConfig | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Fetch gateway config and initialize connection
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const res = await fetch('/api/gateway/config')
        if (!res.ok) {
          throw new Error('Failed to fetch gateway config')
        }
        const cfg: GatewayConfig = await res.json()

        if (!mounted) return

        setConfig(cfg)
        setGatewayToken(cfg.token)
        setGatewayPort(cfg.port)

        // Mark as ready - token is set, RPC calls can proceed
        setIsReady(true)

        // Auto-connect after config is set
        await connect()
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    init()

    // Subscribe to connection state changes
    const unsubscribe = onConnectionStateChange(setState)
    setState(getConnectionState())

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  // Subscribe to session events when connection is established
  useEffect(() => {
    if (state === 'connected') {
      sessionsSubscribe()
        .then((result) => {
          console.log('[GatewayProvider] sessionsSubscribe result:', result)
        })
        .catch((err) => {
          console.error('[GatewayProvider] sessionsSubscribe error:', err)
        })
    }
  }, [state])

  const handleConnect = useCallback(async () => {
    try {
      await connect()
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    }
  }, [])

  const handleDisconnect = useCallback(() => {
    disconnect()
  }, [])

  return (
    <GatewayContext.Provider
      value={{
        state,
        isConnected: state === 'connected',
        isReady,
        connect: handleConnect,
        disconnect: handleDisconnect,
        config,
        error,
      }}
    >
      {children}
    </GatewayContext.Provider>
  )
}