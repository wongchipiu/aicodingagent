/**
 * 中继服务器内部类型定义
 *
 * 不引用 Anthropic SDK，完全自定义。
 */

import type { WebSocket } from 'ws'
import type {
  AgentMessage,
  SessionInfo,
  SessionStatus,
  WSAuthPayload,
  WSRole,
} from '../../shared-types/src/index.js'

/** 活跃的 WebSocket 连接 */
export interface ActiveConnection {
  ws: WebSocket
  auth: WSAuthPayload
  role: WSRole
  /** 最后一次心跳时间 */
  lastHeartbeat: number
  /** 关联的会话 ID 列表（CLI 可能管理多个会话） */
  sessionIds: Set<string>
}

/** 活跃会话 */
export interface ActiveSession {
  sessionId: string
  cliConnectionId: string | null
  iphoneConnectionId: string | null
  status: SessionStatus
  workDir: string
  createdAt: number
  lastActiveAt: number
  isBusy: boolean
  lastUserMessagePreview?: string
  /** 待处理权限请求（requestId → Promise resolve） */
  pendingPermissionRequests: Map<string, (response: AgentMessage) => void>
}

/** 配对码记录 */
export interface PairCodeRecord {
  code: string
  cliClientId: string
  cliConnectionId: string
  createdAt: number
  expiresAt: number
}

/** 中继服务器内部状态 */
export interface RelayState {
  /** 连接 ID → 连接信息 */
  connections: Map<string, ActiveConnection>
  /** 会话 ID → 会话信息 */
  sessions: Map<string, ActiveSession>
  /** 客户端 ID → 连接 ID */
  clientIdToConnId: Map<string, string>
  /** 配对码 → 记录 */
  pairCodes: Map<string, PairCodeRecord>
}

/** 从 ActiveSession 转为可推送的 SessionInfo */
export function toSessionInfo(session: ActiveSession): SessionInfo {
  return {
    sessionId: session.sessionId,
    status: session.status,
    workDir: session.workDir,
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    isBusy: session.isBusy,
    lastUserMessagePreview: session.lastUserMessagePreview,
  }
}
