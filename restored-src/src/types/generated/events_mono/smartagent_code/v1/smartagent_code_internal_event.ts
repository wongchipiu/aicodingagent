export type EnvironmentMetadata = { platform?: string; arch?: string; [key: string]: unknown }
export const SmartAgentCodeInternalEvent = { toJSON: (d: Record<string, unknown>) => d }
