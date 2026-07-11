/**
 * 消息路由 — CLI↔iPhone 双向消息转发
 *
 * 核心职责：
 * 1. 接收 CLI 的 Agent 输出消息 → 转发给绑定的 iPhone
 * 2. 接收 iPhone 的用户消息/权限响应/中断 → 转发给绑定的 CLI
 * 3. 处理心跳消息
 * 4. 处理会话管理消息（session_list 等）
 */

import type { SessionStore } from './sessionStore.js'
import type { ActiveConnection, RelayState } from './types.js'
import type {
  AgentMessage,
  SessionListMessage,
} from '../../shared-types/src/index.js'
import { isAgentMessage } from '../../shared-types/src/index.js'

export class MessageRouter {
  constructor(
    private sessionStore: SessionStore,
    private state: RelayState,
  ) {}

  /**
   * 处理来自任一端的消息
   * @param connectionId 发送方连接 ID
   * @param raw 原始消息字符串
   */
  handleMessage(connectionId: string, raw: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(raw)
    } catch {
      console.warn(`[Router] Invalid JSON from ${connectionId}: ${raw.slice(0, 100)}`)
      return
    }

    if (!isAgentMessage(msg)) {
      console.warn(`[Router] Unknown message type from ${connectionId}: ${JSON.stringify(msg).slice(0, 200)}`)
      return
    }

    const conn = this.state.connections.get(connectionId)
    if (!conn) {
      console.warn(`[Router] Unknown connection: ${connectionId}`)
      return
    }

    // 处理心跳
    if (msg.type === 'heartbeat') {
      this.sessionStore.updateHeartbeat(connectionId)
      this.sendToConnection(connectionId, { type: 'heartbeat_ack', timestamp: Date.now() })
      return
    }

    if (msg.type === 'heartbeat_ack') {
      this.sessionStore.updateHeartbeat(connectionId)
      return
    }

    // 根据来源角色路由
    if (conn.role === 'cli') {
      this.routeFromCLI(connectionId, conn, msg)
    } else {
      this.routeFromIPhone(connectionId, conn, msg)
    }
  }

  // ==================== CLI → iPhone ====================

  private routeFromCLI(_connectionId: string, _conn: ActiveConnection, msg: AgentMessage): void {
    const sessionId = (msg as { session_id?: string }).session_id
    if (!sessionId) {
      console.warn(`[Router] CLI message without session_id: ${msg.type}`)
      return
    }

    const session = this.sessionStore.getSession(sessionId)
    if (!session) {
      console.warn(`[Router] CLI message for unknown session: ${sessionId}`)
      return
    }

    // 更新会话状态
    if (msg.type === 'result') {
      this.sessionStore.setBusy(sessionId, false)
    } else if (msg.type === 'assistant_chunk' || msg.type === 'tool_use_start') {
      this.sessionStore.setBusy(sessionId, true)
    }

    // 转发给绑定的 iPhone
    if (session.iphoneConnectionId) {
      this.sendToConnection(session.iphoneConnectionId, msg)
    } else {
      // 没有绑定的 iPhone，广播给所有 iPhone
      this.broadcastToRole('iphone', msg)
    }
  }

  // ==================== iPhone → CLI ====================

  private routeFromIPhone(connectionId: string, _conn: ActiveConnection, msg: AgentMessage): void {
    // 会话列表请求
    if (
      msg.type === 'user' &&
      (msg as { message?: { content?: unknown } }).message?.content === '__list_sessions__'
    ) {
      const sessionList: SessionListMessage = {
        type: 'session_list',
        sessions: this.sessionStore.listSessions(),
      }
      this.sendToConnection(connectionId, sessionList as unknown as AgentMessage)
      return
    }

    const sessionId = (msg as { session_id?: string }).session_id
    if (!sessionId) {
      console.warn(`[Router] iPhone message without session_id: ${msg.type}`)
      return
    }

    // 绑定 iPhone 到会话（首次交互时自动绑定）
    this.sessionStore.bindIphone(sessionId, connectionId)

    // 更新会话状态
    if (msg.type === 'user') {
      const content = (msg as { message?: { content?: unknown } }).message?.content
      const preview = typeof content === 'string' ? content : JSON.stringify(content)
      this.sessionStore.setLastUserMessage(sessionId, preview)
      this.sessionStore.setBusy(sessionId, true)
    } else if (msg.type === 'interrupt') {
      this.sessionStore.setBusy(sessionId, false)
    }

    // 转发给 CLI
    const session = this.sessionStore.getSession(sessionId)
    if (session?.cliConnectionId) {
      this.sendToConnection(session.cliConnectionId, msg)
    } else {
      // CLI 不在线，通知 iPhone
      this.sendToConnection(connectionId, {
        type: 'system',
        session_id: sessionId,
        subtype: 'error',
        message: 'CLI is offline. Cannot deliver message.',
      })
    }
  }

  // ==================== 发送辅助 ====================

  /** 发送消息到指定连接 */
  sendToConnection(connectionId: string, msg: AgentMessage): boolean {
    const conn = this.state.connections.get(connectionId)
    if (!conn || conn.ws.readyState !== conn.ws.OPEN) {
      return false
    }
    try {
      conn.ws.send(JSON.stringify(msg))
      return true
    } catch (err) {
      console.error(`[Router] Send failed to ${connectionId}:`, err)
      return false
    }
  }

  /** 广播消息到指定角色的所有连接 */
  broadcastToRole(role: 'cli' | 'iphone', msg: AgentMessage): void {
    for (const conn of this.state.connections.values()) {
      if (conn.role === role && conn.ws.readyState === conn.ws.OPEN) {
        this.sendToConnection(
          this.state.clientIdToConnId.get(conn.auth.clientId) ?? '',
          msg,
        )
      }
    }
  }
}
