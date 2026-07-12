/**
 * relay-cli.ts — 自定义 relay 入口点
 *
 * 绕过 main.tsx 的复杂导入链，直接使用：
 * - RelayConnector / RelayConfig / RelayAuth（真实 relay 模块，已验证可加载）
 * - @anthropic-ai/sdk（直接调用 LLM API）
 * - 自定义消息处理循环（替代 messageQueueManager + queryLoop）
 *
 * 支持的能力：
 * ✅ iPhone ↔ 中继 ↔ CLI 连接
 * ✅ 流式文本回复
 * ✅ 多轮对话（维护消息历史）
 * ✅ 工具执行（Bash、FileRead、FileEdit、Grep、Glob）
 * ✅ 权限审批（通过 RelayPermissionBridge 转发到 iPhone）
 * ✅ 中断处理
 * ✅ 心跳保活 + 断线重连
 */

import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve, dirname, relative } from 'path'
import { execSync, spawn } from 'child_process'
import { spawn as BunSpawn } from 'bun'
import { createLLMProvider, type LLMProvider, type ToolDefinition } from '../llm/provider'
import WebSocket from 'ws'

// ============================================================
// 类型定义（从 shared-types 提取，避免导入链问题）
// ============================================================

interface UserInputMessage {
  type: 'user'
  session_id: string
  message: { content: string | unknown[] }
}

interface AgentMessage {
  type: string
  session_id?: string
  [key: string]: unknown
}

function isUserMessage(msg: unknown): msg is UserInputMessage {
  return typeof msg === 'object' && msg !== null && (msg as any).type === 'user'
}

// ============================================================
// Relay 配置
// ============================================================

interface RelayConfig {
  httpUrl: string
  wsUrl: string
  relayKey: string
}

function loadRelayConfig(): RelayConfig | null {
  const url = process.env.PA_RELAY_URL
  const key = process.env.PA_RELAY_KEY
  if (!url || !key) return null

  const wsUrl = url.replace(/^http/, 'ws')
  return { httpUrl: url, wsUrl, relayKey: key }
}

async function registerWithRelay(config: RelayConfig): Promise<{ token: string; clientId: string } | null> {
  try {
    const resp = await fetch(`${config.httpUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relayKey: config.relayKey }),
    })
    if (!resp.ok) {
      console.error(`Registration failed: ${resp.status} ${resp.statusText}`)
      return null
    }
    const data = await resp.json() as any
    return { token: data.token, clientId: data.clientId }
  } catch (e) {
    console.error(`Registration error: ${e}`)
    return null
  }
}

async function generatePairCode(config: RelayConfig, token: string): Promise<string | null> {
  try {
    const resp = await fetch(`${config.httpUrl}/api/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) return null
    const data = await resp.json() as any
    return data.pairCode
  } catch {
    return null
  }
}

async function createRelaySession(config: RelayConfig, token: string, workDir: string): Promise<string | null> {
  try {
    const resp = await fetch(`${config.httpUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workDir }),
    })
    if (!resp.ok) return null
    const data = await resp.json() as any
    return data.sessionId
  } catch {
    return null
  }
}

// ============================================================
// Relay WebSocket 连接
// ============================================================

class SimpleRelayConnector {
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private isManualClose = false

  onUserMessage: ((msg: UserInputMessage) => void) | null = null
  onInterrupt: ((sessionId: string) => void) | null = null
  onControlResponse: ((msg: any) => void) | null = null
  onConnected: (() => void) | null = null
  onDisconnected: (() => void) | null = null

  constructor(
    private wsUrl: string,
    private token: string,
  ) {}

  connect(): void {
    this.isManualClose = false
    this.doConnect()
  }

  private doConnect(): void {
    const url = `${this.wsUrl}?token=${encodeURIComponent(this.token)}`
    try {
      this.ws = new WebSocket(url)
    } catch (err) {
      console.error(`WebSocket creation failed: ${err}`)
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      console.log('[Relay] Connected to relay server')
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.onConnected?.()
    })

    this.ws.on('message', (data: WebSocket.RawData) => {
      const raw = typeof data === 'string' ? data : data.toString()
      try {
        const msg = JSON.parse(raw)
        if (msg.type === 'heartbeat_ack') return
        if (msg.type === 'system') {
          console.log(`[Relay] System: ${msg.subtype} - ${msg.message}`)
          return
        }
        if (msg.type === 'user' && isUserMessage(msg)) {
          this.onUserMessage?.(msg)
          return
        }
        if (msg.type === 'interrupt') {
          this.onInterrupt?.(msg.session_id)
          return
        }
        if (msg.type === 'control_response') {
          this.onControlResponse?.(msg)
          return
        }
      } catch {
        console.warn(`[Relay] Invalid JSON: ${raw.slice(0, 100)}`)
      }
    })

    this.ws.on('close', (code: number) => {
      console.log(`[Relay] Disconnected: ${code}`)
      this.stopHeartbeat()
      this.onDisconnected?.()
      if (!this.isManualClose) this.scheduleReconnect()
    })

    this.ws.on('error', (err: Error) => {
      console.error(`[Relay] WebSocket error: ${err.message}`)
    })
  }

  send(msg: AgentMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(msg))
      return true
    } catch (err) {
      console.error(`[Relay] Send failed: ${err}`)
      return false
    }
  }

  sendAssistantChunk(sessionId: string, content: string, isFinal = false): boolean {
    return this.send({ type: 'assistant_chunk', session_id: sessionId, content, is_final: isFinal })
  }

  sendToolUseStart(sessionId: string, toolUseId: string, toolName: string, input: Record<string, unknown>): boolean {
    return this.send({ type: 'tool_use_start', session_id: sessionId, tool_use_id: toolUseId, tool_name: toolName, input })
  }

  sendToolUseEnd(sessionId: string, toolUseId: string, result: { type: 'tool_result'; tool_use_id: string; content: string | unknown[]; is_error?: boolean }): boolean {
    return this.send({ type: 'tool_use_end', session_id: sessionId, tool_use_id: toolUseId, result })
  }

  sendResult(sessionId: string, result: { subtype: string; duration_ms: number; duration_api_ms: number; num_turns: number; total_cost_usd?: number; error_message?: string }): boolean {
    return this.send({ type: 'result', session_id: sessionId, ...result })
  }

  sendControlRequest(sessionId: string, requestId: string, permission: any): boolean {
    return this.send({ type: 'control_request', request_id: requestId, session_id: sessionId, request: permission })
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat' })
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectAttempts++
    const delay = Math.min(5000 * this.reconnectAttempts, 60000)
    console.log(`[Relay] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect()
    }, delay)
  }

  disconnect(): void {
    this.isManualClose = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// ============================================================
// 权限桥
// ============================================================

class SimplePermissionBridge {
  private pending = new Map<string, (result: any) => void>()

  constructor(private connector: SimpleRelayConnector) {
    connector.onControlResponse = (msg) => {
      if (msg.response?.subtype === 'success') {
        const resolver = this.pending.get(msg.response.request_id)
        if (resolver) {
          resolver(msg.response.response)
          this.pending.delete(msg.response.request_id)
        }
      }
    }
  }

  async requestPermission(sessionId: string, toolName: string, input: Record<string, unknown>): Promise<{ behavior: string; message?: string }> {
    const requestId = randomUUID()
    const promise = new Promise<any>((resolve) => {
      this.pending.set(requestId, resolve)
    })
    const timeout = new Promise<any>((resolve) => {
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId)
          resolve({ behavior: 'deny', message: 'Permission timeout (2min)' })
        }
      }, 120000)
    })

    this.connector.sendControlRequest(sessionId, requestId, {
      subtype: 'can_use_tool',
      tool_name: toolName,
      input,
    })

    return Promise.race([promise, timeout])
  }
}

// ============================================================
// 工具定义
// ============================================================

const BASH_TOOL = {
  name: 'Bash',
  description: 'Execute a bash command on the server. Requires permission approval from iPhone.',
  input_schema: {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'The bash command to execute' },
    },
    required: ['command'],
  },
}

const FILE_READ_TOOL = {
  name: 'FileRead',
  description: 'Read the contents of a file.',
  input_schema: {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
    },
    required: ['file_path'],
  },
}

const FILE_WRITE_TOOL = {
  name: 'FileWrite',
  description: 'Write content to a file. Requires permission approval.',
  input_schema: {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['file_path', 'content'],
  },
}

const FILE_EDIT_TOOL = {
  name: 'FileEdit',
  description: 'Replace text in a file. Requires permission approval.',
  input_schema: {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      old_text: { type: 'string', description: 'Text to find' },
      new_text: { type: 'string', description: 'Text to replace with' },
    },
    required: ['file_path', 'old_text', 'new_text'],
  },
}

const GREP_TOOL = {
  name: 'Grep',
  description: 'Search for a pattern in files.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'Directory to search in (default: cwd)' },
    },
    required: ['pattern'],
  },
}

const GLOB_TOOL = {
  name: 'Glob',
  description: 'Find files matching a pattern.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.ts)' },
      path: { type: 'string', description: 'Directory to search in (default: cwd)' },
    },
    required: ['pattern'],
  },
}

const ALL_TOOLS: ToolDefinition[] = [BASH_TOOL, FILE_READ_TOOL, FILE_WRITE_TOOL, FILE_EDIT_TOOL, GREP_TOOL, GLOB_TOOL]

// Tools that require permission
const DANGEROUS_TOOLS = new Set(['Bash', 'FileWrite', 'FileEdit'])

// ============================================================
// 工具执行
// ============================================================

function executeTool(toolName: string, input: Record<string, unknown>, workDir: string): { content: string; isError: boolean } {
  try {
    switch (toolName) {
      case 'Bash': {
        const command = input.command as string
        const result = execSync(command, { cwd: workDir, encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024 })
        return { content: result || '(no output)', isError: false }
      }
      case 'FileRead': {
        const filePath = input.file_path as string
        const content = readFileSync(filePath, 'utf-8')
        return { content, isError: false }
      }
      case 'FileWrite': {
        const filePath = input.file_path as string
        const content = input.content as string
        const dir = dirname(filePath)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(filePath, content, 'utf-8')
        return { content: `File written: ${filePath}`, isError: false }
      }
      case 'FileEdit': {
        const filePath = input.file_path as string
        const oldText = input.old_text as string
        const newText = input.new_text as string
        const content = readFileSync(filePath, 'utf-8')
        if (!content.includes(oldText)) {
          return { content: `Error: old_text not found in ${filePath}`, isError: true }
        }
        const newContent = content.replace(oldText, newText)
        writeFileSync(filePath, newContent, 'utf-8')
        return { content: `File edited: ${filePath}`, isError: false }
      }
      case 'Grep': {
        const pattern = input.pattern as string
        const searchPath = (input.path as string) || workDir
        try {
          const result = execSync(`rg --line-number --no-heading "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`, {
            encoding: 'utf-8',
            timeout: 15000,
            maxBuffer: 1024 * 1024,
          })
          return { content: result || '(no matches)', isError: false }
        } catch (e: any) {
          if (e.status === 1) return { content: '(no matches)', isError: false }
          return { content: `Grep error: ${e.message}`, isError: true }
        }
      }
      case 'Glob': {
        const pattern = input.pattern as string
        const searchPath = (input.path as string) || workDir
        try {
          const result = execSync(`rg --files -g "${pattern}" "${searchPath}"`, {
            encoding: 'utf-8',
            timeout: 15000,
            maxBuffer: 1024 * 1024,
          })
          return { content: result || '(no files found)', isError: false }
        } catch (e: any) {
          return { content: `Glob error: ${e.message}`, isError: true }
        }
      }
      default:
        return { content: `Unknown tool: ${toolName}`, isError: true }
    }
  } catch (e: any) {
    return { content: `Tool execution error: ${e.message}`, isError: true }
  }
}

// ============================================================
// Agent 消息处理循环
// ============================================================

const SYSTEM_PROMPT = `You are a helpful AI assistant connected via a relay server to an iPhone. You can execute tools on the user's computer.

Available tools:
- Bash: Execute shell commands (requires iPhone approval)
- FileRead: Read file contents
- FileWrite: Write files (requires iPhone approvals)
- FileEdit: Edit files (requires iPhone approval)
- Grep: Search for patterns in files
- Glob: Find files matching a pattern

When the user asks you to do something on their computer, use the appropriate tool. For dangerous operations (Bash, FileWrite, FileEdit), the user will be asked to approve on their iPhone.

Be concise and helpful. If a tool fails, explain the error and suggest alternatives.`

async function processMessage(
  provider: LLMProvider,
  connector: SimpleRelayConnector,
  permissionBridge: SimplePermissionBridge,
  sessionId: string,
  userText: string,
  messageHistory: any[],
  workDir: string,
  abortController: AbortController,
): Promise<void> {
  const startTime = Date.now()

  // Add user message to history
  messageHistory.push({ role: 'user', content: userText })

  let turnCount = 0
  const maxTurns = 20

  while (turnCount < maxTurns) {
    turnCount++
    if (abortController.signal.aborted) {
      connector.sendResult(sessionId, {
        subtype: 'interrupted',
        duration_ms: Date.now() - startTime,
        duration_api_ms: 0,
        num_turns: turnCount,
      })
      return
    }

    connector.send({ type: 'system', session_id: sessionId, subtype: 'status', message: 'Agent is thinking...' })

    let response
    try {
      response = await provider.createMessage({
        system: SYSTEM_PROMPT,
        messages: messageHistory,
        tools: ALL_TOOLS,
        abortSignal: abortController.signal,
      })
    } catch (e: any) {
      if (e.name === 'AbortError') {
        connector.sendResult(sessionId, {
          subtype: 'interrupted',
          duration_ms: Date.now() - startTime,
          duration_api_ms: 0,
          num_turns: turnCount,
        })
        return
      }
      connector.sendResult(sessionId, {
        subtype: 'error',
        duration_ms: Date.now() - startTime,
        duration_api_ms: 0,
        num_turns: turnCount,
        error_message: e.message,
      })
      return
    }

    // Add assistant response to history
    messageHistory.push({ role: 'assistant', content: response.content })

    // Check if there are tool calls
    const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use')
    const textBlocks = response.content.filter((b: any) => b.type === 'text')

    // Send text blocks
    for (const block of textBlocks) {
      connector.sendAssistantChunk(sessionId, block.text)
    }

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0 || response.stopReason === 'end_turn') {
      connector.sendAssistantChunk(sessionId, '', true)
      connector.sendResult(sessionId, {
        subtype: 'success',
        duration_ms: Date.now() - startTime,
        duration_api_ms: 0,
        num_turns: turnCount,
      })
      return
    }

    // Execute tool calls
    const toolResults: any[] = []
    for (const toolUse of toolUseBlocks) {
      const toolName = toolUse.name
      const toolInput = toolUse.input as Record<string, unknown>

      // Send tool use start
      connector.sendToolUseStart(sessionId, toolUse.id, toolName, toolInput)

      // Check if tool requires permission
      if (DANGEROUS_TOOLS.has(toolName)) {
        const permResult = await permissionBridge.requestPermission(sessionId, toolName, toolInput)
        if (permResult.behavior !== 'allow') {
          const errMsg = `Permission denied: ${permResult.message || 'User denied'}`
          connector.sendToolUseEnd(sessionId, toolUse.id, {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: errMsg,
            is_error: true,
          })
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: errMsg, is_error: true })
          continue
        }
      }

      // Execute tool
      const result = executeTool(toolName, toolInput, workDir)

      connector.sendToolUseEnd(sessionId, toolUse.id, {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: result.isError,
      })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: result.isError,
      })
    }

    // Add tool results to history for next turn
    messageHistory.push({ role: 'user', content: toolResults })
  }

  // Max turns reached
  connector.sendResult(sessionId, {
    subtype: 'success',
    duration_ms: Date.now() - startTime,
    duration_api_ms: 0,
    num_turns: turnCount,
  })
}

// ============================================================
// 主入口
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const pairMode = args.includes('--pair')
  const workDirIdx = args.indexOf('--work-dir')
  const workDir = workDirIdx !== -1 ? args[workDirIdx + 1] : process.cwd()

  // Load relay config
  const config = loadRelayConfig()
  if (!config) {
    console.error(
      '\n❌ Relay configuration not found.\n\n' +
        'Set environment variables:\n' +
        '  PA_RELAY_URL  — Relay server URL (e.g., http://192.168.1.100:7780)\n' +
        '  PA_RELAY_KEY  — Pre-shared secret key\n',
    )
    process.exit(1)
  }

  // Create LLM provider (supports Anthropic and OpenAI-compatible APIs)
  let provider: LLMProvider
  try {
    provider = createLLMProvider()
  } catch (e: any) {
    console.error(`\n❌ ${e.message}\n`)
    console.error('Set environment variables for your LLM provider:\n')
    console.error('  Option 1 — Anthropic:')
    console.error('    LLM_PROVIDER=anthropic')
    console.error('    ANTHROPIC_API_KEY=sk-ant-xxx')
    console.error('    ANTHROPIC_MODEL=claude-sonnet-4-20250514  (optional)\n')
    console.error('  Option 2 — OpenAI-compatible (火山引擎/DeepSeek/通义千问):')
    console.error('    LLM_PROVIDER=openai')
    console.error('    OPENAI_API_KEY=your-api-key')
    console.error('    OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3')
    console.error('    OPENAI_MODEL=doubao-pro-32k  (or other model name)\n')
    process.exit(1)
  }

  console.log(`\n🔌 Connecting to relay: ${config.httpUrl}`)

  // Register
  const reg = await registerWithRelay(config)
  if (!reg) {
    console.error('\n❌ Failed to register with relay server.')
    process.exit(1)
  }
  console.log(`✅ Registered. Client ID: ${reg.clientId}`)

  // Pair mode
  if (pairMode) {
    const pairCode = await generatePairCode(config, reg.token)
    if (!pairCode) {
      console.error('\n❌ Failed to generate pair code.')
      process.exit(1)
    }
    console.log('\n📱 iPhone Pairing Code:')
    console.log(`   ┌─────────────┐`)
    console.log(`   │  ${pairCode}  │`)
    console.log(`   └─────────────┘`)
    console.log(`\n   Open your iPhone App and enter this code to pair.`)
    console.log(`   The code expires in 5 minutes.\n`)
    console.log(`   Waiting for iPhone to connect...`)
    console.log(`   Press Ctrl+C to cancel.\n`)
  }

  // Create session
  const sessionId = await createRelaySession(config, reg.token, workDir)
  if (!sessionId) {
    console.error('\n❌ Failed to create session.')
    process.exit(1)
  }
  console.log(`✅ Session: ${sessionId}`)
  console.log(`📁 Work dir: ${workDir}`)

  // Create relay connector
  const connector = new SimpleRelayConnector(config.wsUrl, reg.token)
  const permissionBridge = new SimplePermissionBridge(connector)

  // Message history (per session)
  const messageHistory: any[] = []
  let currentAbortController: AbortController | null = null

  // Set up message handler
  connector.onUserMessage = (msg) => {
    const content = typeof msg.message.content === 'string'
      ? msg.message.content
      : JSON.stringify(msg.message.content)
    console.log(`\n📱 [iPhone] ${content.slice(0, 200)}`)

    // Interrupt current request if running
    if (currentAbortController) {
      currentAbortController.abort('interrupt')
    }

    // Start new request
    currentAbortController = new AbortController()
    processMessage(provider, connector, permissionBridge, sessionId, content, messageHistory, workDir, currentAbortController).catch((e) => {
      console.error(`[Agent] Error: ${e.message}`)
    })
  }

  connector.onInterrupt = () => {
    console.log('\n⏹️ [iPhone] Interrupt requested')
    if (currentAbortController) {
      currentAbortController.abort('interrupt')
    }
  }

  connector.onConnected = () => {
    console.log('🔗 Relay connection established. iPhone can now connect.')
  }

  connector.onDisconnected = () => {
    console.log('⚠️ Relay connection lost. Reconnecting...')
  }

  // Connect
  connector.connect()

  console.log('\n🚀 Personal Agent relay is running.')
  console.log('   Send messages from your iPhone app.')
  console.log('   Press Ctrl+C to stop.\n')

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...')
    connector.disconnect()
    setTimeout(() => process.exit(0), 500)
  })

  return new Promise<void>(() => {})
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
