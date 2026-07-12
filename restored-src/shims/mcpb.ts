/**
 * Stub for @anthropic-ai/mcpb (MCP Bridge)
 * Type-only imports in source; provide minimal stubs.
 */

export type McpbManifest = {
  name: string
  version?: string
  description?: string
  tools?: unknown[]
}

export type McpbServerConfig = {
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export function parseMcpbManifest(_raw: unknown): McpbManifest {
  return { name: 'unknown' }
}

export function isMcpbManifest(_value: unknown): _value is McpbManifest {
  return false
}
