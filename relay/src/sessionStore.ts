/**
 * 会话存储 — 管理活跃会话的注册/注销/心跳/状态追踪
 */

import { randomUUID } from 'crypto'
import type { RelayConfig } from './config.js'
import type { ActiveSession, ActiveConnection, RelayState } from './types.js'
import type { SessionInfo } from '../../shared-types/src/index.js'
import { toSessionInfo } from './types.js'

export class SessionStore {
  constructor(
    private config: RelayConfig,
    private state: RelayState,
  ) {}

  // ==================== 会话生命周期 ====================

  /** 创建新会话 */
  createSession(cliConnectionId: string, workDir: string): ActiveSession {
    const sessionId = randomUUID()
    const now = Date.now()

    const session: ActiveSession = {
      sessionId,
      cliConnectionId,
      iphoneConnectionId: null,
      status: 'active',
      workDir,
      createdAt: now,
      lastActiveAt: now,
      isBusy: false,
      pendingPermissionRequests: new Map(),
    }

    this.state.sessions.set(sessionId, session)

    // 将会话关联到 CLI 连接
    const conn = this.state.connections.get(cliConnectionId)
    if (conn) {
      conn.sessionIds.add(sessionId)
    }

    console.log(`[Session] Created: ${sessionId} (workDir=${workDir})`)
    return session
  }

  /** 获取会话 */
  getSession(sessionId: string): ActiveSession | undefined {
    return this.state.sessions.get(sessionId)
  }

  /** 列出所有会话（供 iPhone 查看会话列表） */
  listSessions(): SessionInfo[] {
    return Array.from(this.state.sessions.values()).map(toSessionInfo)
  }

  /** 删除会话 */
  removeSession(sessionId: string): void {
    const session = this.state.sessions.get(sessionId)
    if (!session) return

    // 从 CLI 连接中移除关联
    if (session.cliConnectionId) {
      const conn = this.state.connections.get(session.cliConnectionId)
      conn?.sessionIds.delete(sessionId)
    }

    this.state.sessions.delete(sessionId)
    console.log(`[Session] Removed: ${sessionId}`)
  }

  // ==================== 会话状态更新 ====================

  /** 标记会话忙碌（Agent 正在处理） */
  setBusy(sessionId: string, busy: boolean): void {
    const session = this.state.sessions.get(sessionId)
    if (session) {
      session.isBusy = busy
      session.lastActiveAt = Date.now()
    }
  }

  /** 更新最后用户消息摘要 */
  setLastUserMessage(sessionId: string, preview: string): void {
    const session = this.state.sessions.get(sessionId)
    if (session) {
      session.lastUserMessagePreview = preview.slice(0, 100)
      session.lastActiveAt = Date.now()
    }
  }

  /** 绑定 iPhone 到会话 */
  bindIphone(sessionId: string, iphoneConnectionId: string): boolean {
    const session = this.state.sessions.get(sessionId)
    if (!session) return false
    session.iphoneConnectionId = iphoneConnectionId
    console.log(`[Session] iPhone bound: ${sessionId} → ${iphoneConnectionId}`)
    return true
  }

  // ==================== 心跳管理 ====================

  /** 更新连接心跳时间 */
  updateHeartbeat(connectionId: string): void {
    const conn = this.state.connections.get(connectionId)
    if (conn) {
      conn.lastHeartbeat = Date.now()
    }
  }

  /** 检查心跳超时，返回需要断开的连接 ID 列表 */
  checkHeartbeats(): string[] {
    const now = Date.now()
    const timeoutMs = this.config.heartbeatTimeoutSec * 1000
    const timedOut: string[] = []

    for (const [connId, conn] of this.state.connections) {
      if (now - conn.lastHeartbeat > timeoutMs) {
        console.log(
          `[Heartbeat] Timeout: ${connId} (role=${conn.role}, lastSeen=${new Date(conn.lastHeartbeat).toISOString()})`,
        )
        timedOut.push(connId)
      }
    }

    return timedOut
  }

  // ==================== 连接管理 ====================

  /** 注册新连接 */
  registerConnection(connectionId: string, conn: ActiveConnection): void {
    this.state.connections.set(connectionId, conn)
    this.state.clientIdToConnId.set(conn.auth.clientId, connectionId)
    console.log(
      `[Connection] Registered: ${connectionId} (role=${conn.role}, clientId=${conn.auth.clientId})`,
    )
  }

  /** 注销连接，清理关联资源 */
  unregisterConnection(connectionId: string): void {
    const conn = this.state.connections.get(connectionId)
    if (!conn) return

    // 清理会话关联
    for (const sessionId of conn.sessionIds) {
      const session = this.state.sessions.get(sessionId)
      if (session) {
        if (conn.role === 'cli') {
          // CLI 断开，标记会话断线
          session.cliConnectionId = null
          session.status = 'disconnected'
          console.log(`[Session] CLI disconnected: ${sessionId}`)
        } else if (conn.role === 'iphone') {
          // iPhone 断开，仅解除绑定
          if (session.iphoneConnectionId === connectionId) {
            session.iphoneConnectionId = null
          }
        }
      }
    }

    this.state.clientIdToConnId.delete(conn.auth.clientId)
    this.state.connections.delete(connectionId)
    console.log(`[Connection] Unregistered: ${connectionId}`)
  }

  /** 根据 clientId 获取连接 */
  getConnectionByClientId(clientId: string): ActiveConnection | undefined {
    const connId = this.state.clientIdToConnId.get(clientId)
    if (!connId) return undefined
    return this.state.connections.get(connId)
  }

  /** 获取指定角色的所有活跃连接 */
  getConnectionsByRole(role: 'cli' | 'iphone'): ActiveConnection[] {
    const result: ActiveConnection[] = []
    for (const conn of this.state.connections.values()) {
      if (conn.role === role && conn.ws.readyState === conn.ws.OPEN) {
        result.push(conn)
      }
    }
    return result
  }

  /** 获取会话关联的对端连接 */
  getPeerConnection(
    sessionId: string,
    fromRole: 'cli' | 'iphone',
  ): ActiveConnection | undefined {
    const session = this.state.sessions.get(sessionId)
    if (!session) return undefined

    const peerConnId = fromRole === 'cli' ? session.iphoneConnectionId : session.cliConnectionId
    if (!peerConnId) return undefined
    return this.state.connections.get(peerConnId)
  }
}
