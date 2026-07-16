/**
 * 工具注册表：聚合所有工具模块，提供统一的定义列表和执行入口
 *
 * executeTool 集成了 hooks（执行前后触发）和权限检查（危险操作确认）
 */
import type { ToolDefinition } from '../../llm/provider'
import type { ToolModule, ToolContext } from './types'
import { fileReadTool, fileWriteTool, fileEditTool, multiEditTool } from './tools/files'
import { grepTool, globTool, webSearchTool, webFetchTool } from './tools/search'
import { bashTool, powerShellTool, replTool } from './tools/exec'
import {
  todoWriteTool,
  askUserQuestionTool,
  agentTool,
  scheduleCronTool,
} from './tools/orchestration'
import { notebookEditTool } from './tools/notebook'
import { diffTool } from './tools/diff-tool'
import { gitTool } from './tools/git'
import { sleepTool } from './tools/sleep'
import { lspTool } from './tools/lsp'
import { mcpTool } from './tools/mcp'
import { sessionManageTool, memoryManageTool } from './tools/session-tools'

export const ALL_TOOL_MODULES: ToolModule[] = [
  // 文件操作
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  multiEditTool,
  notebookEditTool,
  // 搜索与网络
  grepTool,
  globTool,
  webSearchTool,
  webFetchTool,
  // 命令执行
  bashTool,
  powerShellTool,
  replTool,
  // 版本控制
  gitTool,
  diffTool,
  // 编排与交互
  todoWriteTool,
  askUserQuestionTool,
  agentTool,
  scheduleCronTool,
  sleepTool,
  // 代码智能
  lspTool,
  // 外部集成
  mcpTool,
  // 会话与记忆
  sessionManageTool,
  memoryManageTool,
]

export function getAllToolDefinitions(): ToolDefinition[] {
  return ALL_TOOL_MODULES.map((m) => m.definition)
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ content: string; isError: boolean }> {
  const mod = ALL_TOOL_MODULES.find((m) => m.definition.name === toolName)
  if (!mod) {
    return { content: `Unknown tool: ${toolName}`, isError: true }
  }

  // 权限检查
  try {
    const decision = await ctx.permissions.check(toolName, input)
    if (decision === 'deny') {
      // 危险操作需确认
      const allowed = await ctx.permissions.request(toolName, input)
      if (!allowed) {
        return { content: `Permission denied for ${toolName}`, isError: true }
      }
    }
  } catch {
    // 权限检查失败不阻断
  }

  // beforeTool hook
  try {
    await ctx.hooks.emit('beforeTool', { toolName, input })
  } catch {
    // hook 错误不阻断
  }

  // 执行工具
  let result: { content: string; isError: boolean }
  try {
    result = await mod.execute(input, ctx)
  } catch (e: any) {
    result = { content: `Tool execution error: ${e.message}`, isError: true }
  }

  // afterTool hook
  try {
    await ctx.hooks.emit('afterTool', { toolName, input, result })
  } catch {
    // hook 错误不阻断
  }

  return result
}
