/**
 * Hooks 系统 — 工具执行前后钩子 + 生命周期事件
 *
 * 参考: restored-src/src/hooks/ 和 utils/hooks/
 * 提供 beforeTool/afterTool/beforeMessage/afterMessage/fileChanged 事件
 */
import type { HookManager, HookEvent, HookHandler, HookContext } from './types'

export function createHookManager(): HookManager {
  const handlers = new Map<HookEvent, HookHandler[]>()

  return {
    on(event: HookEvent, handler: HookHandler) {
      const list = handlers.get(event) || []
      list.push(handler)
      handlers.set(event, list)
    },

    async emit(event: HookEvent, ctx: HookContext) {
      const list = handlers.get(event)
      if (!list || list.length === 0) return
      // 并行触发所有 handler，但忽略错误（hooks 不应阻断主流程）
      await Promise.allSettled(list.map((h) => Promise.resolve(h(ctx))))
    },
  }
}

/** 注册默认 hooks（日志/审计） */
export function registerDefaultHooks(hooks: HookManager, logFile?: string): void {
  const { appendFileSync } = require('fs') as typeof import('fs')

  hooks.on('beforeTool', (ctx) => {
    const ts = new Date().toISOString()
    const line = `[${ts}] TOOL_START: ${ctx.toolName} ${JSON.stringify(ctx.input || {}).slice(0, 200)}\n`
    if (logFile) {
      try { appendFileSync(logFile, line) } catch {}
    }
  })

  hooks.on('afterTool', (ctx) => {
    const ts = new Date().toISOString()
    const errFlag = ctx.result?.isError ? 'ERROR' : 'OK'
    const line = `[${ts}] TOOL_END: ${ctx.toolName} ${errFlag}\n`
    if (logFile) {
      try { appendFileSync(logFile, line) } catch {}
    }
  })

  hooks.on('beforeMessage', (ctx) => {
    const ts = new Date().toISOString()
    const line = `[${ts}] USER_MSG: ${(ctx.userMessage || '').slice(0, 200)}\n`
    if (logFile) {
      try { appendFileSync(logFile, line) } catch {}
    }
  })
}
