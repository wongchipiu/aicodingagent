/**
 * 共享类型定义
 */
import type { ToolDefinition, LLMProvider } from '../../llm/provider'

export interface ToolResult {
  content: string
  isError: boolean
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  content: string
  status: TodoStatus
  activeForm?: string
}

export interface ScheduledTask {
  id: string
  expression: string
  prompt: string
  intervalMs: number
  timer: NodeJS.Timeout
  lastRun?: number
  runCount: number
}

// ============================================================
// Hooks 系统
// ============================================================

export type HookEvent = 'beforeTool' | 'afterTool' | 'beforeMessage' | 'afterMessage' | 'fileChanged'

export interface HookContext {
  toolName?: string
  input?: Record<string, unknown>
  result?: ToolResult
  userMessage?: string
  filePath?: string
}

export type HookHandler = (ctx: HookContext) => void | Promise<void>

export interface HookManager {
  on(event: HookEvent, handler: HookHandler): void
  emit(event: HookEvent, ctx: HookContext): Promise<void>
}

// ============================================================
// 记忆系统
// ============================================================

export interface MemoryItem {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface MemoryStore {
  load(): MemoryItem[]
  save(memories: MemoryItem[]): void
  add(title: string, content: string): MemoryItem
  search(query: string): MemoryItem[]
  delete(id: string): boolean
  getAll(): MemoryItem[]
}

// ============================================================
// 会话持久化
// ============================================================

export interface SessionManager {
  save(name: string, history: any[]): string
  load(name: string): any[] | null
  list(): string[]
  exportSession(name: string, format: 'json' | 'markdown'): string
  getCurrent(): string | null
}

// ============================================================
// 权限系统
// ============================================================

export type PermissionDecision = 'allow' | 'deny'

export interface PermissionManager {
  check(toolName: string, input: Record<string, unknown>): Promise<PermissionDecision>
  request(toolName: string, input: Record<string, unknown>): Promise<boolean>
  addRule(pattern: string, decision: PermissionDecision): void
}

// ============================================================
// 文件缓存
// ============================================================

export interface FileCache {
  get(key: string): string | undefined
  set(key: string, value: string): void
  has(key: string): boolean
  delete(key: string): void
  clear(): void
}

// ============================================================
// 文件监控
// ============================================================

export interface FileWatcher {
  watch(paths: string[]): void
  unwatch(): void
  onChange(cb: (path: string) => void): void
  stop(): void
}

// ============================================================
// 工具上下文 & 模块
// ============================================================

export interface ToolContext {
  workDir: string
  provider: LLMProvider
  messageHistory: any[]
  todos: TodoItem[]
  scheduledTasks: Map<string, ScheduledTask>
  /** 向终端用户提问（readline），返回用户输入 */
  askUser: (question: string) => Promise<string>
  /** 运行子代理，返回最终文本结果 */
  runSubAgent: (prompt: string, maxTurns?: number) => Promise<string>
  /** Hooks 系统 */
  hooks: HookManager
  /** 跨会话记忆 */
  memory: MemoryStore
  /** 会话持久化 */
  session: SessionManager
  /** 权限系统 */
  permissions: PermissionManager
  /** 文件内容缓存 */
  fileCache: FileCache
  /** 文件监控 */
  fileWatcher: FileWatcher
}

export interface ToolModule {
  definition: ToolDefinition
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}
