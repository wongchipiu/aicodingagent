/**
 * Stub for @ant/computer-use-mcp and subpaths
 * Computer use is behind feature('CHICAGO_MCP') which returns false.
 */

export type ComputerUseSessionContext = {
  sessionId: string
  screenWidth: number
  screenHeight: number
}

export type CuCallToolResult = {
  content: unknown[]
  isError?: boolean
}

export type CuPermissionRequest = {
  type: string
  description: string
}

export type CuPermissionResponse = {
  allowed: boolean
}

export type CuSubGates = {
  screenshot: boolean
  mouse: boolean
  keyboard: boolean
}

export type CoordinateMode = 'absolute' | 'relative'

export const DEFAULT_GRANT_FLAGS: CuSubGates = {
  screenshot: false,
  mouse: false,
  keyboard: false,
}

export type ScreenshotDims = {
  width: number
  height: number
}

export function bindSessionContext(_ctx: ComputerUseSessionContext): void {}

export function buildComputerUseTools(): unknown[] {
  return []
}

export function getSentinelCategory(_appPath: string): string | null {
  return null
}
