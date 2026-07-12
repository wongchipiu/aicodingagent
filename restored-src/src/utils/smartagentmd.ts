export type MemoryFileInfo = { path: string; content: string; isConditional?: boolean; isUserDefined?: boolean; isManaged?: boolean }
export const MAX_MEMORY_CHARACTER_COUNT = 50000
export async function getMemoryFiles(): Promise<MemoryFileInfo[]> { return [] }
export async function getSmartAgentMds(): Promise<string | null> { return null }
export function filterInjectedMemoryFiles(files: MemoryFileInfo[]): MemoryFileInfo[] { return files }
export function getLargeMemoryFiles(): MemoryFileInfo[] { return [] }
export function clearMemoryFileCaches(): void {}
export function resetGetMemoryFilesCache(): void {}
export function getExternalSmartAgentMdIncludes(): string[] { return [] }
export function hasExternalSmartAgentMdIncludes(): boolean { return false }
export function shouldShowSmartAgentMdExternalIncludesWarning(): boolean { return false }
export function getManagedAndUserConditionalRules(): MemoryFileInfo[] { return [] }
export function getMemoryFilesForNestedDirectory(): MemoryFileInfo[] { return [] }
export function getConditionalRulesForCwdLevelDirectory(): MemoryFileInfo[] { return [] }
