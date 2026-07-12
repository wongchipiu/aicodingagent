export type SmartAgentCodeHint = { type: string; value: string }
export function extractSmartAgentCodeHints(stdout: string): { stripped: string; hints: SmartAgentCodeHint[] } { return { stripped: stdout, hints: [] } }
export function hasShownHintThisSession(): boolean { return false }
export function setPendingHint(): void {}
