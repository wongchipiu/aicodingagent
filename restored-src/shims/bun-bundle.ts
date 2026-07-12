/**
 * bun:bundle shim — runtime replacement for Bun's build-time feature() macro.
 *
 * In the original Bun build, feature('FLAG_NAME') is evaluated at compile time
 * to true/false and dead-code-eliminated. At runtime with `bun run`, we return
 * false for all flags, disabling optional features (BUDDY, VOICE_MODE, KAIROS,
 * COORDINATOR_MODE, etc.) while keeping core functionality intact.
 */

export function feature(_name: string): boolean {
  return false
}
