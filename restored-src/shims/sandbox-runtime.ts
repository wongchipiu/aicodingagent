/**
 * Stub for @anthropic-ai/sandbox-runtime
 * Sandbox execution is not available in external builds.
 */

export interface SandboxConfig {
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

export class SandboxRuntime {
  constructor(_config?: SandboxConfig) {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async execute(_command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return { stdout: '', stderr: 'Sandbox runtime not available', exitCode: 1 }
  }
}

export function createSandbox(_config?: SandboxConfig): SandboxRuntime {
  return new SandboxRuntime(_config)
}

export function isSandboxAvailable(): boolean {
  return false
}
