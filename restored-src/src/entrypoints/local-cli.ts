/**
 * local-cli.ts — 本地交互式 CLI（增强版 v2）
 *
 * 不需要 relay 服务器，直接在终端对话。
 * 支持 Anthropic 原生 API 和任何 OpenAI 兼容 API。
 *
 * 工具集（23 个）：
 *   文件: FileRead / FileWrite / FileEdit / MultiEdit / NotebookEdit
 *   搜索: Grep / Glob / WebSearch / WebFetch
 *   执行: Bash / PowerShell / REPL / Sleep
 *   版本: Git / Diff
 *   编排: TodoWrite / AskUserQuestion / Agent / ScheduleCron
 *   智能: CodeDiagnostics
 *   外部: MCP
 *   会话: SessionManage / MemoryManage
 *
 * 增强特性：上下文自动压缩 / 子代理委派 / 定时任务 / Hooks / 权限 /
 *   跨会话记忆 / 会话持久化 / 文件监控 / LRU缓存 / 并发执行 / UI美化 / MCP集成
 *
 * 用法:
 *   bun run src/entrypoints/local-cli.ts [--resume <session>]
 *
 * 环境变量:
 *   LLM_PROVIDER=anthropic|openai (默认 anthropic)
 *   Anthropic: ANTHROPIC_API_KEY, ANTHROPIC_MODEL
 *   OpenAI兼容: OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
 */

import * as readline from 'readline'
import pMap from 'p-map'
import { createLLMProvider, type LLMProvider } from '../llm/provider'
import { buildSystemPrompt } from '../local-cli/system-prompt'
import { compactIfNeeded } from '../local-cli/compact'
import { getAllToolDefinitions, executeTool } from '../local-cli/registry'
import { createHookManager, registerDefaultHooks } from '../local-cli/hooks'
import { createPermissionManager } from '../local-cli/permissions'
import { createMemoryStore, extractMemoryFromHistory } from '../local-cli/memory'
import { createSessionManager } from '../local-cli/session'
import { createFileCache } from '../local-cli/cache'
import { createFileWatcher } from '../local-cli/file-watcher'
import { cleanupMcpConnections } from '../local-cli/tools/mcp'
import * as ui from '../local-cli/ui'
import type { ToolContext, TodoItem, ScheduledTask } from '../local-cli/types'

// ============================================================
// 会话状态
// ============================================================

const todos: TodoItem[] = []
const scheduledTasks = new Map<string, ScheduledTask>()

// ============================================================
// 子代理运行器
// ============================================================

async function runSubAgent(
  provider: LLMProvider,
  prompt: string,
  workDir: string,
  maxTurns: number,
  sharedCtx: ToolContext,
): Promise<string> {
  const subHistory: any[] = []
  const subCtx: ToolContext = {
    ...sharedCtx,
    messageHistory: subHistory,
    askUser: () => Promise.resolve('(sub-agent cannot ask user directly)'),
    runSubAgent: () => Promise.reject(new Error('nested sub-agents are not allowed')),
  }
  subHistory.push({ role: 'user', content: prompt })

  for (let turn = 0; turn < maxTurns; turn++) {
    let response
    try {
      response = await provider.createMessage({
        system: buildSystemPrompt(workDir),
        messages: subHistory,
        tools: getAllToolDefinitions(),
        abortSignal: new AbortController().signal,
      })
    } catch (e: any) {
      return `(sub-agent LLM error: ${e.message})`
    }

    subHistory.push({ role: 'assistant', content: response.content })

    const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use')
    const textBlocks = response.content.filter((b: any) => b.type === 'text')

    if (response.stopReason === 'end_turn' || toolUseBlocks.length === 0) {
      return textBlocks.map((b: any) => b.text).join('\n') || '(sub-agent produced no text output)'
    }

    const toolResults = await pMap(
      toolUseBlocks,
      async (toolUse: any) => {
        console.log(`    ${ui.dim('[Sub-Agent]')} ${ui.toolName(toolUse.name)}`)
        const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>, subCtx)
        return {
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError,
        }
      },
      { concurrency: 3 },
    )
    subHistory.push({ role: 'user', content: toolResults })
  }
  return '(sub-agent reached max turns without completing)'
}

// ============================================================
// 消息处理循环
// ============================================================

export async function processMessage(
  provider: LLMProvider,
  userText: string,
  messageHistory: any[],
  ctx: ToolContext,
): Promise<void> {
  await ctx.hooks.emit('beforeMessage', { userMessage: userText })
  messageHistory.push({ role: 'user', content: userText })

  const allTools = getAllToolDefinitions()
  let turnCount = 0
  const maxTurns = 30

  while (turnCount < maxTurns) {
    turnCount++
    await compactIfNeeded(provider, messageHistory)

    let response
    try {
      const memories = ctx.memory.getAll()
      const memoryContext = memories.length > 0
        ? memories.slice(-5).map((m) => `- [${m.title}] ${m.content.slice(0, 100)}`).join('\n')
        : undefined

      response = await provider.createMessage({
        system: buildSystemPrompt(ctx.workDir, memoryContext),
        messages: messageHistory,
        tools: allTools,
        abortSignal: new AbortController().signal,
      })
    } catch (e: any) {
      console.error(`\n  ${ui.error('[ERROR]')} ${e.message}\n`)
      return
    }

    messageHistory.push({ role: 'assistant', content: response.content })

    const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use')
    const textBlocks = response.content.filter((b: any) => b.type === 'text')

    for (const block of textBlocks) {
      console.log(`\n${block.text}`)
    }

    if (toolUseBlocks.length === 0 || response.stopReason === 'end_turn') {
      await ctx.hooks.emit('afterMessage', {})
      return
    }

    // 并行执行工具调用
    console.log()
    const toolResults = await pMap(
      toolUseBlocks,
      async (toolUse: any) => {
        const toolName = toolUse.name
        const toolInput = toolUse.input as Record<string, unknown>
        console.log(`  ${ui.formatToolCall(toolName, toolInput)}`)

        const result = await executeTool(toolName, toolInput, ctx)
        console.log(ui.formatToolResult(result.content, result.isError))

        return {
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError,
        }
      },
      { concurrency: 3 },
    )

    messageHistory.push({ role: 'user', content: toolResults })
  }

  console.log(`\n  ${ui.warning('[WARN]')} Max turns reached.\n`)
}

// ============================================================
// 清理
// ============================================================

async function cleanup(
  ctx: ToolContext,
  fileWatcher: any,
  messageHistory: any[],
  provider: LLMProvider,
): Promise<void> {
  // 清理定时任务
  for (const task of ctx.scheduledTasks.values()) {
    clearInterval(task.timer)
  }
  ctx.scheduledTasks.clear()

  // 停止文件监控
  fileWatcher.stop()

  // 清理 MCP 连接
  await cleanupMcpConnections()

  // 自动提取记忆（如果对话足够长）
  if (messageHistory.length > 6) {
    try {
      const memoryItem = await extractMemoryFromHistory(messageHistory, async (text) => {
        const resp = await provider.createMessage({
          system: 'Summarize the key facts, decisions, and tasks from this conversation in 2-3 sentences.',
          messages: [{ role: 'user', content: text }],
          tools: [],
          abortSignal: new AbortController().signal,
        })
        return resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ')
      })
      if (memoryItem) {
        ctx.memory.add(memoryItem.title, memoryItem.content)
        console.log(`\n  ${ui.success('✓')} Memory saved: ${memoryItem.title}`)
      }
    } catch {
      // 记忆提取失败不影响退出
    }
  }
}

// ============================================================
// 主入口
// ============================================================

async function main(): Promise<void> {
  const workDir = process.cwd()
  const args = process.argv.slice(2)
  const resumeSession = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : null

  // 创建 LLM Provider
  let provider: LLMProvider
  try {
    provider = createLLMProvider()
  } catch (e: any) {
    console.error(`\n  ${e.message}\n`)
    console.error('Set environment variables for your LLM provider:\n')
    console.error('  Option 1 — Anthropic:')
    console.error('    LLM_PROVIDER=anthropic  ANTHROPIC_API_KEY=sk-ant-xxx\n')
    console.error('  Option 2 — OpenAI-compatible:')
    console.error('    LLM_PROVIDER=openai  OPENAI_API_KEY=ark-xxx')
    console.error('    OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3')
    console.error('    OPENAI_MODEL=doubao-pro-32k\n')
    process.exit(1)
  }

  // 初始化基础设施
  const hooks = createHookManager()
  registerDefaultHooks(hooks, `${workDir}/.agent-sessions/agent.log`)
  const memory = createMemoryStore()
  const session = createSessionManager(workDir)
  const fileCache = createFileCache()
  const fileWatcher = createFileWatcher(workDir)

  fileWatcher.onChange((path) => {
    console.log(`\n  ${ui.info('[FileChanged]')} ${path}\n  > `)
  })
  fileWatcher.watch(['.'])

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '  > ' })
  const askUser = (q: string) => new Promise<string>((resolve) => rl.question(q, (a) => resolve(a.trim())))
  const permissions = createPermissionManager(askUser)

  const ctx: ToolContext = {
    workDir,
    provider,
    messageHistory: [],
    todos,
    scheduledTasks,
    askUser,
    runSubAgent: (p: string, maxTurns?: number) => runSubAgent(provider, p, workDir, maxTurns || 10, ctx),
    hooks,
    memory,
    session,
    permissions,
    fileCache,
    fileWatcher,
  }

  const messageHistory = ctx.messageHistory

  // 恢复会话
  if (resumeSession) {
    const loaded = session.load(resumeSession)
    if (loaded) {
      messageHistory.push(...loaded)
      console.log(`\n  ${ui.success('✓')} Resumed session "${resumeSession}" (${loaded.length} messages)`)
    } else {
      console.log(`\n  ${ui.warning('⚠')} Session "${resumeSession}" not found, starting fresh`)
    }
  }

  // 启动信息
  const toolCount = getAllToolDefinitions().length
  const toolNames = getAllToolDefinitions().map((t) => t.name).join(', ')
  const memories = memory.getAll()
  console.log(`\n  ${ui.header('Personal Agent — Local CLI (Enhanced v2)')}`)
  console.log(`  ${ui.dim('Working directory:')} ${workDir}`)
  console.log(`  ${ui.dim('Tools')} (${toolCount}): ${toolNames}`)
  if (memories.length > 0) console.log(`  ${ui.dim('Memories:')} ${memories.length} items loaded`)
  console.log(`  ${ui.dim('Commands: /save <name>  /sessions  /memories  /tools  exit')}`)
  console.log(`  ${ui.dim('Type your message and press Enter.')}\n`)

  rl.prompt()

  rl.on('line', async (line: string) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }

    // 内置命令
    if (input === 'exit' || input === 'quit' || input === '/q') {
      await cleanup(ctx, fileWatcher, messageHistory, provider)
      console.log('\n  Bye!\n')
      process.exit(0)
    }
    if (input === '/sessions') {
      const sessions = session.list()
      console.log(`\n  ${sessions.length > 0 ? sessions.map((s) => `  - ${s}`).join('\n') : '(none)'}\n`)
      rl.prompt(); return
    }
    if (input === '/memories') {
      const all = memory.getAll()
      console.log(`\n  ${all.length > 0 ? all.map((m) => `  [${m.id}] ${m.title}`).join('\n') : '(none)'}\n`)
      rl.prompt(); return
    }
    if (input === '/tools') {
      console.log(`\n  ${toolNames}\n`)
      rl.prompt(); return
    }
    if (input.startsWith('/save ')) {
      const name = input.slice(6).trim()
      console.log(`\n  ${session.save(name, messageHistory)}\n`)
      rl.prompt(); return
    }

    rl.pause()
    try {
      await processMessage(provider, input, messageHistory, ctx)
    } catch (e: any) {
      console.error(`\n  ${ui.error('[ERROR]')} ${e.message}\n`)
    }
    rl.resume()
    rl.prompt()
  })

  rl.on('close', async () => {
    await cleanup(ctx, fileWatcher, messageHistory, provider)
    console.log('\n  Bye!\n')
    process.exit(0)
  })
}

if (import.meta.main) {
  main().catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
}
