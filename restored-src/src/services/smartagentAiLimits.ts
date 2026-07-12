export type OverageDisabledReason = string
export type SmartAgentAILimits = { status: 'allowed' | 'allowed_warning' | 'rejected'; unifiedRateLimitFallbackAvailable: boolean; isUsingOverage: boolean; resetsAt?: number }
export const currentLimits: SmartAgentAILimits = { status: 'allowed', unifiedRateLimitFallbackAvailable: false, isUsingOverage: false }
export const statusListeners: Set<(l: SmartAgentAILimits) => void> = new Set()
export function getRateLimitWarning(): string | null { return null }
export function getUsingOverageText(): string { return '' }
export function getRateLimitErrorMessage(): string | null { return null }
export function getRawUtilization(): number | undefined { return undefined }
export async function checkQuotaStatus(): Promise<void> {}
