import { useEffect, useState } from 'react'
import {
  type SmartAgentAILimits,
  currentLimits,
  statusListeners,
} from './smartagentAiLimits.js'

export function useSmartAgentAiLimits(): SmartAgentAILimits {
  const [limits, setLimits] = useState<SmartAgentAILimits>({ ...currentLimits })

  useEffect(() => {
    const listener = (newLimits: SmartAgentAILimits) => {
      setLimits({ ...newLimits })
    }
    statusListeners.add(listener)

    return () => {
      statusListeners.delete(listener)
    }
  }, [])

  return limits
}
