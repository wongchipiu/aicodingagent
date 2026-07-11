/**
 * RelayConnector — CLI 端 WebSocket 客户端
 *
 * 职责：
 * 1. 连接中继服务器，保持长连接
 * 2. 接收 iPhone 发来的用户消息/中断请求，通过回调通知 QueryEngine
 * 3. 将 Agent 的输出消息（流式文本/工具调用/结果）转发给中继→iPhone
 * 4. 转发权限请求到 iPhone，接收审批响应
 * 5. 心跳保活
 */

import WebSocket from 'ws'
import type {
  AgentMessage,
  ControlRequest,
  ControlResponse,
  PermissionRequest,
  UserInputMessage,
} from '../../../../shared-types/src/index.js'
import {
  isAgentMessage,
  makeHeartbeat,
} from '../../../../shared-types/src/index.js'

/** 回调接口：接收来自 iPhone 的消息 */
export interface RelayConnectorCallbacks {
  /** 收到 iPhone 发来的用户消息 */
  onUserMessage: (msg: UserInputMessage) => void
  /** 收到 iPhone 发来的中断请求 */
  onInterrupt: (sessionId: string) => void
  /** 连接建立 */
  onConnected?: () => void
  /** 连接断开 */
  onDisconnected?: () => void
  /** 错误 */
  onError?: (error: Error) => void
}

/** 心跳间隔（毫秒） */
const HEARTBEAT_INTERVAL_MS = 30_000

/** 重连间隔（毫秒） */
const RECONNECT_INTERVAL_MS = 5_000

/** 最大重连间隔 */
const MAX_RECONNECT_INTERVAL_MS = 60_000

export class RelayConnector {
  private ws: WebSocket | null = null
  private token: string
  private wsUrl: string
  private callbacks: RelayConnectorCallbacks
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private isManualClose = false

  /** 控制响应回调（由 RelayPermissionBridge 设置） */
  public onControlResponse: ((msg: ControlResponse) => void) | null = null

  constructor(
    wsUrl: string,
    token: string,
    callbacks: RelayConnectorCallbacks,
  ) {
    this.wsUrl = wsUrl
    this.token = token
    this.callbacks = callbacks
  }

  /** 建立 WebSocket 连接 */
  connect(): void {
    this.isManualClose = false
    this.doConnect()
  }

  /** 内部连接逻辑 */
  private doConnect(): void {
    const urlWithToken = `${this.wsUrl}?token=${encodeURIComponent(this.token)}`

    try {
      this.ws = new WebSocket(urlWithToken)
    } catch (err) {
      this.callbacks.onError?.(new Error(`Failed to create WebSocket: ${err}`))
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      console.log('[RelayConnector] Connected to relay server')
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.callbacks.onConnected?.()
    })

    this.ws.on('message', (data: WebSocket.RawData) => {
      const raw = typeof data === 'string' ? data : data.toString()
      this.handleMessage(raw)
    })

    this.ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[RelayConnector] Disconnected: ${code} ${reason.toString()}`)
      this.stopHeartbeat()
      this.callbacks.onDisconnected?.()

      if (!this.isManualClose) {
        this.scheduleReconnect()
      }
    })

    this.ws.on('error', (err: Error) => {
      console.error('[RelayConnector] WebSocket error:', err.message)
      this.callbacks.onError?.(err)
    })
  }

  /** 处理收到的消息 */
  private handleMessage(raw: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(raw)
    } catch {
      console.warn(`[RelayConnector] Invalid JSON: ${raw.slice(0, 100)}`)
      return
    }

    if (!isAgentMessage(msg)) {
      console.warn(`[RelayConnector] Unknown message: ${JSON.stringify(msg).slice(0, 200)}`)
      return
    }

    // 心跳响应
    if (msg.type === 'heartbeat_ack') {
      return
    }

    // 系统消息
    if (msg.type === 'system') {
      console.log(`[RelayConnector] System: ${msg.subtype} - ${msg.message}`)
      return
    }

    // 用户消息
    if (msg.type === 'user') {
      this.callbacks.onUserMessage(msg)
      return
    }

    // 中断请求
    if (msg.type === 'interrupt') {
      this.callbacks.onInterrupt(msg.session_id)
      return
    }

    // 控制响应（权限审批结果）
    if (msg.type === 'control_response') {
      this.onControlResponse?.(msg)
      return
    }
  }

  // ==================== 发送消息 ====================

  /** 发送 Agent 输出消息到中继→iPhone */
  sendAgentMessage(msg: AgentMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false
    }
    try {
      this.ws.send(JSON.stringify(msg))
      return true
    } catch (err) {
      console.error('[RelayConnector] Send failed:', err)
      return false
    }
  }

  /** 发送权限请求控制消息 */
  sendControlRequest(
    sessionId: string,
    requestId: string,
    permission: PermissionRequest,
  ): boolean {
    const msg: ControlRequest = {
      type: 'control_request',
      request_id: requestId,
      session_id: sessionId,
      request: permission,
    }
    return this.sendAgentMessage(msg)
  }

  /** 发送流式文本块 */
  sendAssistantChunk(sessionId: string, content: string, isFinal = false): boolean {
    return this.sendAgentMessage({
      type: 'assistant_chunk',
      session_id: sessionId,
      content,
      is_final: isFinal,
    })
  }

  /** 发送工具调用开始事件 */
  sendToolUseStart(
    sessionId: string,
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): boolean {
    return this.sendAgentMessage({
      type: 'tool_use_start',
      session_id: sessionId,
      tool_use_id: toolUseId,
      tool_name: toolName,
      input,
    })
  }

  /** 发送工具调用结束事件 */
  sendToolUseEnd(
    sessionId: string,
    toolUseId: string,
    result: {
      type: 'tool_result'
      tool_use_id: string
      content: string | unknown[]
      is_error?: boolean
    },
  ): boolean {
    return this.sendAgentMessage({
      type: 'tool_use_end',
      session_id: sessionId,
      tool_use_id: toolUseId,
      result,
    })
  }

  /** 发送回合结果 */
  sendResult(
    sessionId: string,
    result: {
      subtype: 'success' | 'error' | 'interrupted'
      duration_ms: number
      duration_api_ms: number
      num_turns: number
      total_cost_usd?: number
      error_message?: string
    },
  ): boolean {
    return this.sendAgentMessage({
      type: 'result',
      session_id: sessionId,
      ...result,
    })
  }

  // ==================== 心跳 ====================

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.sendAgentMessage(makeHeartbeat())
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // ==================== 重连 ====================

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    this.reconnectAttempts++
    const delay = Math.min(
      RECONNECT_INTERVAL_MS * this.reconnectAttempts,
      MAX_RECONNECT_INTERVAL_MS,
    )
    console.log(`[RelayConnector] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect()
    }, delay)
  }

  // ==================== 生命周期 ====================

  /** 手动断开连接 */
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

  /** 是否已连接 */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
