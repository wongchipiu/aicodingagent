/**
 * 会话与记忆工具 — SessionManage / MemoryManage
 *
 * 参考: restored-src/src/services/memory/ + 会话持久化逻辑
 * SessionManage: save/load/list/export 对话历史
 * MemoryManage: add/search/list/delete 跨会话记忆
 */
import type { ToolModule } from '../types'

export const sessionManageTool: ToolModule = {
  definition: {
    name: 'SessionManage',
    description:
      'Manage conversation sessions: save current history, load a previous session (for resuming), list saved sessions, or export a session as JSON/Markdown.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['save', 'load', 'list', 'export'],
          description: 'Action to perform',
        },
        name: { type: 'string', description: 'Session name (for save/load/export)' },
        format: {
          type: 'string',
          enum: ['json', 'markdown'],
          description: 'Export format (for export action, default: markdown)',
        },
      },
      required: ['action'],
    },
  },
  async execute(input, ctx) {
    const action = input.action as string
    const name = (input.name as string) || `session-${Date.now()}`

    switch (action) {
      case 'save': {
        const result = ctx.session.save(name, ctx.messageHistory)
        return { content: result, isError: false }
      }
      case 'load': {
        const history = ctx.session.load(name)
        if (!history) {
          return { content: `Session "${name}" not found`, isError: true }
        }
        // 替换当前历史
        ctx.messageHistory.length = 0
        ctx.messageHistory.push(...history)
        return {
          content: `Loaded session "${name}" (${history.length} messages). Conversation resumed.`,
          isError: false,
        }
      }
      case 'list': {
        const sessions = ctx.session.list()
        if (sessions.length === 0) {
          return { content: 'No saved sessions', isError: false }
        }
        return {
          content: `Saved sessions (${sessions.length}):\n${sessions.map((s) => `  - ${s}`).join('\n')}`,
          isError: false,
        }
      }
      case 'export': {
        const format = ((input.format as string) || 'markdown') as 'json' | 'markdown'
        const exported = ctx.session.exportSession(name, format)
        return { content: exported, isError: false }
      }
      default:
        return { content: `Unknown action: ${action}`, isError: true }
    }
  },
}

export const memoryManageTool: ToolModule = {
  definition: {
    name: 'MemoryManage',
    description:
      'Manage cross-session memories: add a memory (persists across sessions), search memories, list all, or delete. Memories are stored in ~/.agent-memory/memory.json.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'search', 'list', 'delete'],
          description: 'Action to perform',
        },
        title: { type: 'string', description: 'Memory title (for add)' },
        content: { type: 'string', description: 'Memory content (for add)' },
        query: { type: 'string', description: 'Search query (for search)' },
        id: { type: 'string', description: 'Memory ID (for delete)' },
      },
      required: ['action'],
    },
  },
  async execute(input, ctx) {
    const action = input.action as string

    switch (action) {
      case 'add': {
        const title = input.title as string
        const content = input.content as string
        if (!title || !content) {
          return { content: 'Error: title and content are required for add', isError: true }
        }
        const item = ctx.memory.add(title, content)
        return {
          content: `Memory saved: [${item.id}] ${item.title}`,
          isError: false,
        }
      }
      case 'search': {
        const query = input.query as string
        if (!query) {
          return { content: 'Error: query is required for search', isError: true }
        }
        const results = ctx.memory.search(query)
        if (results.length === 0) {
          return { content: `No memories matching "${query}"`, isError: false }
        }
        const formatted = results
          .map((m) => `[${m.id}] ${m.title}\n  ${m.content.slice(0, 200)}`)
          .join('\n\n')
        return { content: `Found ${results.length} memories:\n\n${formatted}`, isError: false }
      }
      case 'list': {
        const memories = ctx.memory.getAll()
        if (memories.length === 0) {
          return { content: 'No memories stored', isError: false }
        }
        const formatted = memories
          .map((m) => `[${m.id}] ${m.title} (${new Date(m.createdAt).toISOString().slice(0, 10)})`)
          .join('\n')
        return { content: `Memories (${memories.length}):\n${formatted}`, isError: false }
      }
      case 'delete': {
        const id = input.id as string
        const deleted = ctx.memory.delete(id)
        if (!deleted) {
          return { content: `Memory "${id}" not found`, isError: true }
        }
        return { content: `Memory "${id}" deleted`, isError: false }
      }
      default:
        return { content: `Unknown action: ${action}`, isError: true }
    }
  },
}
