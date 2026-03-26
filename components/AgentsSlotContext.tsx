'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AgentsSlotContextValue {
  agentsSlot: ReactNode | null
  setAgentsSlot: (slot: ReactNode | null) => void
}

const AgentsSlotContext = createContext<AgentsSlotContextValue | null>(null)

export function AgentsSlotProvider({ children }: { children: ReactNode }) {
  const [agentsSlot, setAgentsSlot] = useState<ReactNode | null>(null)

  const handleSetSlot = useCallback((slot: ReactNode | null) => {
    setAgentsSlot(slot)
  }, [])

  return (
    <AgentsSlotContext.Provider value={{ agentsSlot, setAgentsSlot: handleSetSlot }}>
      {children}
    </AgentsSlotContext.Provider>
  )
}

export function useAgentsSlot() {
  const context = useContext(AgentsSlotContext)
  if (!context) {
    throw new Error('useAgentsSlot must be used within AgentsSlotProvider')
  }
  return context
}