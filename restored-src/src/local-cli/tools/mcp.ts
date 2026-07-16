/**
 * MCP 工具 — 连接外部 MCP (Model Context Protocol) 服务器
 *
 * 参考: restored-src/src/services/mcp/ + tools/MCPTool/
 * 依赖: @modelcontextprotocol/sdk（package.json 已有）
 *
 * 轻量版：支持通过 stdio 连接 MCP 服务器，发现并调用其工具
 * 连接状态保存在模块级 Map 中
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { spawn } from 'child_process'
import type { ToolModule } from '../types'

// 模块级连接管理
interface McpConnection {
  id: string
  client: Client
  transport: StdioClientTransport
  tools: any[]
}

const connections = new Map<string, McpConnection>()

export const mcpTool: ToolModule = {
  definition: {
    name: 'MCP',
    description:
      'Connect to and interact with external MCP (Model Context Protocol) servers. Supports: connect (spawn server via command), list (list server tools), call (invoke a tool), disconnect. MCP servers extend agent capabilities with external tools.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['connect', 'list', 'call', 'disconnect', 'list_connections'],
          description: 'Action to perform',
        },
        server_id: {
          type: 'string',
          description: 'Server connection ID (for list/call/disconnect)',
        },
        command: {
          type: 'string',
          description: 'Command to spawn MCP server (for connect, e.g. "npx -y @modelcontextprotocol/server-filesystem /tmp")',
        },
        tool_name: {
          type: 'string',
          description: 'MCP tool name to call (for call action)',
        },
        tool_input: {
          type: 'object',
          description: 'Input arguments for the MCP tool (for call action)',
          properties: {},
        },
      },
      required: ['action'],
    },
  },
  async execute(input) {
    const action = input.action as string

    try {
      switch (action) {
        case 'connect': {
          const command = input.command as string
          if (!command) {
            return { content: 'Error: command is required for connect', isError: true }
          }

          const parts = command.split(/\s+/)
          const serverId = `mcp-${Date.now()}`

          const transport = new StdioClientTransport({
            command: parts[0],
            args: parts.slice(1),
          })

          const client = new Client(
            { name: 'local-cli', version: '1.0.0' },
            { capabilities: {} },
          )

          await client.connect(transport)

          // 发现工具
          const toolsResult = await client.listTools()
          const tools = toolsResult.tools || []

          connections.set(serverId, { id: serverId, client, transport, tools })

          const toolList = tools.map((t: any) => `  - ${t.name}: ${t.description?.slice(0, 80) || ''}`).join('\n')
          return {
            content: `Connected to MCP server "${serverId}"\nCommand: ${command}\nAvailable tools (${tools.length}):\n${toolList}`,
            isError: false,
          }
        }

        case 'list': {
          const serverId = input.server_id as string
          const conn = connections.get(serverId)
          if (!conn) {
            return { content: `Error: No connection with id "${serverId}"`, isError: true }
          }
          const toolList = conn.tools
            .map((t: any) => `  - ${t.name}: ${t.description?.slice(0, 80) || ''}`)
            .join('\n')
          return {
            content: `MCP server "${serverId}" tools (${conn.tools.length}):\n${toolList}`,
            isError: false,
          }
        }

        case 'call': {
          const serverId = input.server_id as string
          const toolName = input.tool_name as string
          const toolInput = (input.tool_input as Record<string, unknown>) || {}

          const conn = connections.get(serverId)
          if (!conn) {
            return { content: `Error: No connection with id "${serverId}"`, isError: true }
          }

          const result = await conn.client.callTool({ name: toolName, arguments: toolInput })
          const content = result.content
            ?.map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c)))
            .join('\n') || '(no output)'

          return { content, isError: false }
        }

        case 'disconnect': {
          const serverId = input.server_id as string
          const conn = connections.get(serverId)
          if (!conn) {
            return { content: `Error: No connection with id "${serverId}"`, isError: true }
          }
          await conn.transport.close()
          connections.delete(serverId)
          return { content: `Disconnected from "${serverId}"`, isError: false }
        }

        case 'list_connections': {
          if (connections.size === 0) {
            return { content: 'No active MCP connections', isError: false }
          }
          const list = Array.from(connections.values())
            .map((c) => `  - ${c.id}: ${c.tools.length} tools`)
            .join('\n')
          return { content: `Active MCP connections (${connections.size}):\n${list}`, isError: false }
        }

        default:
          return { content: `Unknown action: ${action}`, isError: true }
      }
    } catch (e: any) {
      return { content: `MCP error: ${e.message}`, isError: true }
    }
  },
}

/** 清理所有 MCP 连接（退出时调用） */
export async function cleanupMcpConnections(): Promise<void> {
  for (const conn of connections.values()) {
    try {
      await conn.transport.close()
    } catch {}
  }
  connections.clear()
}
