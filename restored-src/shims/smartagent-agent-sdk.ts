/**
 * Stub for @anthropic-ai/smartagent-agent-sdk
 * Only type exports are used in the source; provide minimal type-compatible stubs.
 */

export type PermissionMode = 'default' | 'plan' | 'auto' | 'bypassPermissions'

export type AgentSDKConfig = {
  apiKey?: string
  model?: string
  baseUrl?: string
}

export class SmartAgentAgentSDK {
  constructor(_config?: AgentSDKConfig) {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
}
