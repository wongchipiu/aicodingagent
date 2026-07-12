/**
 * Stub for @ant/computer-use-swift
 * Type-only import in source.
 */

export type ComputerUseAPI = {
  screenshot(): Promise<Buffer>
  mouseMove(_x: number, _y: number): Promise<void>
  mouseClick(_button: string): Promise<void>
  keyPress(_key: string): Promise<void>
  typeText(_text: string): Promise<void>
}
