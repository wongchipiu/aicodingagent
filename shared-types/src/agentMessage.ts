/**
 * AgentMessage — 自定义消息类型，替代 Anthropic SDKMessage
 *
 * 本文件定义了 Personal Agent 中继协议中所有消息的通用类型。
 * 不引用任何 Anthropic SDK 类型，完全独立定义。
 */

// ==================== 基础内容类型 ====================

/** 文本内容块 */
export interface TextBlock {
  type: 'text'
  text: string
}

/** 工具使用内容块 */
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/** 工具结果内容块 */
export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | TextBlock[]
  is_error?: boolean
}

/** 消息内容联合类型 */
export type MessageContent = string | (TextBlock | ToolUseBlock | ToolResultBlock)[]

// ==================== 角色消息 ====================

/** 用户消息 */
export interface UserMessage {
  role: 'user'
  content: MessageContent
}

/** 助手消息 */
export interface AssistantMessage {
  role: 'assistant'
  content: MessageContent
  model?: string
  stop_reason?: string | null
}

/** 角色消息联合类型 */
export type RoleMessage = UserMessage | AssistantMessage

// ==================== Agent 消息类型 ====================

/** Agent 回复的流式文本块（增量） */
export interface AssistantChunkMessage {
  type: 'assistant_chunk'
  session_id: string
  content: string
  /** 是否为该回复的最后一块 */
  is_final?: boolean
}

/** Agent 完整消息（非流式） */
export interface AssistantMessageEvent {
  type: 'assistant_message'
  session_id: string
  message: AssistantMessage
}

/** 工具调用开始事件 */
export interface ToolUseStartEvent {
  type: 'tool_use_start'
  session_id: string
  tool_use_id: string
  tool_name: string
  input: Record<string, unknown>
}

/** 工具调用结束事件 */
export interface ToolUseEndEvent {
  type: 'tool_use_end'
  session_id: string
  tool_use_id: string
  result: ToolResultBlock
}

/** Agent 回合结束事件 */
export interface ResultEvent {
  type: 'result'
  session_id: string
  subtype: 'success' | 'error' | 'interrupted'
  duration_ms: number
  duration_api_ms: number
  num_turns: number
  total_cost_usd?: number
  error_message?: string
}

/** 系统消息 */
export interface SystemEvent {
  type: 'system'
  session_id: string
  subtype: 'init' | 'status' | 'warning' | 'error'
  message: string
}

/** Agent 输出消息联合类型 */
export type AgentOutputMessage =
  | AssistantChunkMessage
  | AssistantMessageEvent
  | ToolUseStartEvent
  | ToolUseEndEvent
  | ResultEvent
  | SystemEvent

// ==================== 权限请求 ====================

/** 权限请求子类型 */
export type PermissionRequestSubtype = 'can_use_tool'

/** 权限请求 */
export interface PermissionRequest {
  subtype: PermissionRequestSubtype
  tool_name: string
  input: Record<string, unknown>
  tool_use_id: string
}

/** 权限行为 */
export type PermissionBehavior = 'allow' | 'deny'

/** 权限响应结果 */
export interface PermissionResult {
  behavior: PermissionBehavior
  /** allow 时可携带修改后的输入 */
  updatedInput?: Record<string, unknown>
  /** deny 时携带拒绝原因 */
  message?: string
}

// ==================== 控制消息 ====================

/** 控制请求（权限请求/中断等，从 CLI→iPhone 方向） */
export interface ControlRequest {
  type: 'control_request'
  request_id: string
  session_id: string
  request:
    | PermissionRequest
    | { subtype: 'interrupt' }
}

/** 控制响应（权限审批结果，从 iPhone→CLI 方向） */
export interface ControlResponse {
  type: 'control_response'
  session_id: string
  response:
    | {
        subtype: 'success'
        request_id: string
        response: PermissionResult
      }
    | {
        subtype: 'error'
        request_id: string
        error: string
      }
}

/** 用户输入消息（从 iPhone→CLI 方向） */
export interface UserInputMessage {
  type: 'user'
  session_id: string
  message: UserMessage
  parent_tool_use_id: string | null
}

/** 中断请求（从 iPhone→CLI 方向） */
export interface InterruptRequest {
  type: 'interrupt'
  session_id: string
}

/** 心跳消息 */
export interface HeartbeatMessage {
  type: 'heartbeat'
  timestamp: number
}

/** 心跳响应 */
export interface HeartbeatAckMessage {
  type: 'heartbeat_ack'
  timestamp: number
}

// ==================== 顶层消息联合类型 ====================

/** 中继协议中所有可能传输的消息 */
export type AgentMessage =
  | UserInputMessage
  | ControlRequest
  | ControlResponse
  | InterruptRequest
  | AgentOutputMessage
  | HeartbeatMessage
  | HeartbeatAckMessage

/** 消息类型字面量集合，用于运行时校验 */
export const MESSAGE_TYPES = [
  'user',
  'assistant_chunk',
  'assistant_message',
  'tool_use_start',
  'tool_use_end',
  'result',
  'system',
  'control_request',
  'control_response',
  'interrupt',
  'heartbeat',
  'heartbeat_ack',
] as const

/** 判断对象是否为合法的 AgentMessage */
export function isAgentMessage(value: unknown): value is AgentMessage {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.type === 'string' && MESSAGE_TYPES.includes(obj.type as never)
}
