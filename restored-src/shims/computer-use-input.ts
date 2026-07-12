/**
 * Stub for @ant/computer-use-input
 * Input injection is behind feature('CHICAGO_MCP') which returns false.
 */

export type InputEvent = {
  type: 'mouse' | 'keyboard'
  data: unknown
}

export function createInputInjector() {
  return {
    async send(_event: InputEvent): Promise<void> {},
    async close(): Promise<void> {},
  }
}
