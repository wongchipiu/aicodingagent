/**
 * RelayProtocol — 中继服务器协议定义
 *
 * 定义 CLI/Relay/iPhone 三端通信的认证、会话管理、消息路由协议。
 * 自建认证 + 自建中继，零外部 SDK 依赖。
 */

import type {
  AgentMessage,
  PermissionRequest,
  PermissionResult,
} from './agentMessage.js'

// ==================== 认证协议 ====================

/** CLI 注册请求 */
export interface CLIRegisterRequest {
  /** 预共享密钥（PA_RELAY_KEY 环境变量） */
  relayKey: string
  /** CLI 机器标识（hostname + hash） */
  machineId: string
  /** CLI 版本号 */
  version?: string
}

/** CLI 注册成功响应 */
export interface CLIRegisterResponse {
  success: true
  /** JWT token，后续 WS 连接使用 */
  token: string
  /** 客户端 ID */
  clientId: string
  /** Token 过期时间（Unix ms） */
  expiresAt: number
}

/** iPhone 配对请求 */
export interface IPhonePairRequest {
  /** 6 位配对码（CLI 端生成） */
  pairCode: string
  /** iPhone 设备 UUID */
  deviceUuid: string
  /** 设备名称（如 "Bruce's iPhone"） */
  deviceName: string
}

/** iPhone 配对成功响应 */
export interface IPhonePairResponse {
  success: true
  token: string
  /** 绑定的 CLI clientId */
  cliClientId: string
  expiresAt: number
}

/** 认证失败响应 */
export interface AuthErrorResponse {
  success: false
  error: string
  code: 'INVALID_KEY' | 'INVALID_PAIR_CODE' | 'EXPIRED' | 'UNAUTHORIZED'
}

/** HTTP 认证请求联合类型 */
export type AuthRequest = CLIRegisterRequest | IPhonePairRequest

/** HTTP 认证响应联合类型 */
export type AuthResponse =
  | CLIRegisterResponse
  | IPhonePairResponse
  | AuthErrorResponse

// ==================== 会话管理 ====================

/** 会话状态 */
export type SessionStatus = 'active' | 'idle' | 'disconnected'

/** 会话信息（推送给 iPhone 显示） */
export interface SessionInfo {
  sessionId: string
  status: SessionStatus
  /** 工作目录 */
  workDir: string
  /** 创建时间 Unix ms */
  createdAt: number
  /** 最后活跃时间 Unix ms */
  lastActiveAt: number
  /** 当前是否正在执行（等待 Agent 回复） */
  isBusy: boolean
  /** 最近一条用户消息摘要 */
  lastUserMessagePreview?: string
}

/** 会话列表响应 */
export interface SessionListMessage {
  type: 'session_list'
  sessions: SessionInfo[]
}

/** 会话创建请求（iPhone 发起新对话） */
export interface CreateSessionRequest {
  workDir?: string
}

/** 会话创建响应 */
export interface CreateSessionResponse {
  success: true
  sessionId: string
}

// ==================== WS 连接角色 ====================

/** WebSocket 连接角色 */
export type WSRole = 'cli' | 'iphone'

/** WS 连接认证信息（从 JWT 解析） */
export interface WSAuthPayload {
  /** 客户端 ID */
  clientId: string
  /** 连接角色 */
  role: WSRole
  /** 设备标识 */
  deviceId: string
  /** Token 签发时间 */
  iat: number
  /** Token 过期时间 */
  exp: number
}

// ==================== 中继内部消息封装 ====================

/**
 * 中继服务器在 WS 上传输的封装消息。
 * 在原始 AgentMessage 外层添加 sessionId 路由信息。
 */
export interface RelayEnvelope {
  /** 消息来源角色 */
  from: WSRole
  /** 目标角色（可选，不指定则广播给对端） */
  to?: WSRole
  /** 会话 ID */
  sessionId: string
  /** 原始消息体 */
  payload: AgentMessage
}

// ==================== 便捷构造函数 ====================

/** 构造权限请求控制消息 */
export function makePermissionRequest(
  requestId: string,
  sessionId: string,
  permission: PermissionRequest,
): AgentMessage {
  return {
    type: 'control_request',
    request_id: requestId,
    session_id: sessionId,
    request: permission,
  }
}

/** 构造权限响应消息 */
export function makePermissionResponse(
  requestId: string,
  sessionId: string,
  result: PermissionResult,
): AgentMessage {
  return {
    type: 'control_response',
    session_id: sessionId,
    response: {
      subtype: 'success',
      request_id: requestId,
      response: result,
    },
  }
}

/** 构造中断请求 */
export function makeInterruptRequest(sessionId: string): AgentMessage {
  return {
    type: 'interrupt',
    session_id: sessionId,
  }
}

/** 构造用户输入消息 */
export function makeUserInputMessage(
  sessionId: string,
  content: string,
): AgentMessage {
  return {
    type: 'user',
    session_id: sessionId,
    message: {
      role: 'user',
      content,
    },
    parent_tool_use_id: null,
  }
}

/** 构造心跳消息 */
export function makeHeartbeat(): AgentMessage {
  return {
    type: 'heartbeat',
    timestamp: Date.now(),
  }
}
