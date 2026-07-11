/**
 * RelaySessionManager — 整合 RelayConnector 与 Agent 消息处理流程
 *
 * 核心职责：
 * 1. 接收 iPhone 用户消息 → 注入 messageQueueManager 队列（queryLoop 自动 drain）
 * 2. 接收 iPhone 中断请求 → abortController.abort('interrupt')
 * 3. 将 Agent 流式输出（StreamEvent/Message）转发到 iPhone
 * 4. 权限请求转发到 iPhone → 等待审批响应
 *
 * 架构：
 *   iPhone → Relay → [RelaySessionManager] → messageQueueManager → queryLoop
 *                          ↓                                      ↓
 *                     权限转发 ← canUseTool ← StreamingToolExecutor
 *                          ↓                                      ↓
 *                     iPhone ← Relay ← [RelaySessionManager] ← query() yield
 */

import { randomUUID } from 'crypto'
import type { RelayConnector } from './relayConnector.js'
import type { RelayPermissionBridge } from './relayPermissionBridge.js'
import { enqueue } from '../utils/messageQueueManager.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import type {
  AgentMessage,
  UserInputMessage,
} from '../../../../shared-types/src/index.js'

/** StreamEvent 类型来自 query.ts，这里用 duck-typing 处理 */
interface StreamLike {
  type: string
  [key: string]: unknown
}

/** 消息类型（从 query() yield 出来的） */
interface MessageLike {
  type: string
  role?: string
  content?: unknown
  subtype?: string
  uuid?: string
}

export class RelaySessionManager {
  private sessionId: string
  private connector: RelayConnector
  private permissionBridge: RelayPermissionBridge
  private abortController: AbortController | null = null

  constructor(
    sessionId: string,
    connector: RelayConnector,
    permissionBridge: RelayPermissionBridge,
  ) {
    this.sessionId = sessionId
    this.connector = connector
    this.permissionBridge = permissionBridge

    // 注册消息回调
    this.setupCallbacks()
  }

  // ==================== 回调注册 ====================

  private setupCallbacks(): void {
    // RelayConnector 的回调在构造时已设置，
    // 这里通过覆写 connector 的回调来处理 iPhone 消息
    // 实际上 RelayConnector 已在构造时传入 callbacks，
    // 我们通过 setSessionCallbacks 来更新行为
  }

  // ==================== iPhone → Agent ====================

  /**
   * 处理 iPhone 发来的用户消息 — 注入消息队列
   *
   * queryLoop 的 while(true) 循环每轮会从 messageQueueManager drain 消息，
   * 所以只需将消息 enqueue 即可，queryLoop 会自动处理。
   */
  handleUserMessage(msg: UserInputMessage): void {
    const content = typeof msg.message.content === 'string'
      ? msg.message.content
      : JSON.stringify(msg.message.content)

    console.log(`[RelaySession] User message from iPhone: ${content.slice(0, 80)}`)

    const command: QueuedCommand = {
      value: content,
      mode: 'prompt-input',  // 标准用户输入模式
      priority: 'now',       // 最高优先级，立即处理
      uuid: randomUUID(),
      // 远程消息不触发本地 slash commands
      skipSlashCommands: true,
      bridgeOrigin: true,
    }

    enqueue(command)
  }

  /**
   * 处理 iPhone 发来的中断请求
   *
   * 通过 abortController.abort('interrupt') 中断当前 turn。
   * 'interrupt' reason 表示用户输入了新消息（不是纯取消），
   * queryLoop 会在检测到后跳过中断消息，直接处理队列中的新消息。
   */
  handleInterrupt(_sessionId: string): void {
    console.log(`[RelaySession] Interrupt from iPhone`)
    if (this.abortController) {
      this.abortController.abort('interrupt')
    }
  }

  // ==================== Agent → iPhone ====================

  /**
   * 转发 query() 的流式输出到 iPhone
   *
   * 在 for await (const msg of query(params)) 循环中调用此方法。
   * 根据 msg.type 转换为 AgentMessage 格式并发送到中继服务器。
   */
  forwardStreamEvent(event: StreamLike | MessageLike): void {
    const type = event.type

    // 流式文本块
    if (type === 'stream_event') {
      const subtype = (event as { subtype?: string }).subtype
      if (subtype === 'text_delta') {
        const text = (event as { text?: string }).text ?? ''
        if (text) {
          this.connector.sendAssistantChunk(this.sessionId, text)
        }
      }
      return
    }

    // 流式请求开始
    if (type === 'stream_request_start') {
      this.connector.sendAgentMessage({
        type: 'system',
        session_id: this.sessionId,
        subtype: 'status',
        message: 'Agent is thinking...',
      })
      return
    }

    // 助手消息
    if (type === 'assistant') {
      const content = (event as { content?: unknown }).content
      let text = ''
      if (typeof content === 'string') {
        text = content
      } else if (Array.isArray(content)) {
        text = content
          .filter((b: { type?: string }) => b.type === 'text')
          .map((b: { text?: string }) => b.text ?? '')
          .join('')
      }

      if (text) {
        // 发送最终文本（非流式增量）
        this.connector.sendAssistantChunk(this.sessionId, text, true)
      }
      return
    }

    // 系统消息
    if (type === 'system') {
      const subtype = (event as { subtype?: string }).subtype ?? 'status'
      const message = (event as { message?: string }).message ?? ''
      if (message) {
        this.connector.sendAgentMessage({
          type: 'system',
          session_id: this.sessionId,
          subtype: subtype as 'init' | 'status' | 'warning' | 'error',
          message,
        })
      }
      return
    }

    // 工具使用开始
    if (type === 'tool_use') {
      const toolName = (event as { name?: string }).name ?? 'unknown'
      const toolUseId = (event as { id?: string }).id ?? randomUUID()
      const input = (event as { input?: Record<string, unknown> }).input ?? {}

      this.connector.sendToolUseStart(
        this.sessionId,
        toolUseId,
        toolName,
        input,
      )
      return
    }

    // 工具结果
    if (type === 'tool_result') {
      const toolUseId = (event as { tool_use_id?: string }).tool_use_id ?? ''
      const content = (event as { content?: unknown }).content ?? ''
      const isError = (event as { is_error?: boolean }).is_error ?? false

      this.connector.sendToolUseEnd(this.sessionId, toolUseId, {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: typeof content === 'string' ? content : JSON.stringify(content),
        is_error: isError,
      })
      return
    }
  }

  /**
   * 发送回合结束信号
   */
  forwardTurnComplete(result: {
    subtype: 'success' | 'error' | 'interrupted'
    durationMs: number
    apiDurationMs: number
    numTurns: number
    totalCostUsd?: number
    errorMessage?: string
  }): void {
    this.connector.sendResult(this.sessionId, {
      subtype: result.subtype,
      duration_ms: result.durationMs,
      duration_api_ms: result.apiDurationMs,
      num_turns: result.numTurns,
      total_cost_usd: result.totalCostUsd,
      error_message: result.errorMessage,
    })
  }

  // ==================== AbortController 管理 ====================

  /** 设置当前 turn 的 AbortController */
  setAbortController(controller: AbortController): void {
    this.abortController = controller
  }

  /** 获取权限桥（供 canUseTool 回调使用） */
  getPermissionBridge(): RelayPermissionBridge {
    return this.permissionBridge
  }

  /** 获取会话 ID */
  getSessionId(): string {
    return this.sessionId
  }

  /** 获取底层连接器 */
  getConnector(): RelayConnector {
    return this.connector
  }
}
