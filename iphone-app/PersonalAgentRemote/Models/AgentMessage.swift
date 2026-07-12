//
//  AgentMessage.swift
//  PersonalAgentRemote
//
//  自定义 AgentMessage 类型，映射中继协议 JSON。
//  零第三方 SDK 依赖，纯原生 Swift 实现。
//

import Foundation

// MARK: - 消息类型枚举

enum AgentMessageType: String, Codable {
    case user
    case assistantChunk = "assistant_chunk"
    case assistantMessage = "assistant_message"
    case toolUseStart = "tool_use_start"
    case toolUseEnd = "tool_use_end"
    case result
    case system
    case controlRequest = "control_request"
    case controlResponse = "control_response"
    case interrupt
    case heartbeat
    case heartbeatAck = "heartbeat_ack"
    case sessionList = "session_list"
}

// MARK: - 基础内容类型

struct TextBlock: Codable, Identifiable {
    let type: String
    let text: String
    var id: String { text }
}

struct ToolUseBlock: Codable, Identifiable {
    let type: String
    let id: String
    let name: String
    let input: [String: AnyCodable]
}

struct ToolResultBlock: Codable {
    let type: String
    let toolUseId: String
    let content: AnyCodable
    let isError: Bool?
}

// MARK: - 权限请求

struct PermissionRequest: Codable {
    let subtype: String
    let toolName: String
    let input: [String: AnyCodable]
    let toolUseId: String
}

struct PermissionResult: Codable {
    let behavior: String
    let updatedInput: [String: AnyCodable]?
    let message: String?
}

// MARK: - 会话信息

struct SessionInfo: Codable, Identifiable {
    let sessionId: String
    let status: String
    let workDir: String
    let createdAt: Double
    let lastActiveAt: Double
    let isBusy: Bool
    let lastUserMessagePreview: String?

    var id: String { sessionId }
}

// MARK: - Agent 消息（用于 ChatView 渲染）

struct AgentMessage: Identifiable {
    let id: String
    let role: MessageRole
    var content: String
    let timestamp: Date
    var isStreaming: Bool
    var toolUseName: String?

    enum MessageRole: String {
        case user
        case assistant
        case system
    }
}

// MARK: - AnyCodable（处理动态 JSON）

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intVal = try? container.decode(Int.self) {
            self.value = intVal
        } else if let doubleVal = try? container.decode(Double.self) {
            self.value = doubleVal
        } else if let boolVal = try? container.decode(Bool.self) {
            self.value = boolVal
        } else if let stringVal = try? container.decode(String.self) {
            self.value = stringVal
        } else if let arrayVal = try? container.decode([AnyCodable].self) {
            self.value = arrayVal.map { $0.value }
        } else if let dictVal = try? container.decode([String: AnyCodable].self) {
            self.value = dictVal.mapValues { $0.value }
        } else {
            self.value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let intVal as Int:
            try container.encode(intVal)
        case let doubleVal as Double:
            try container.encode(doubleVal)
        case let boolVal as Bool:
            try container.encode(boolVal)
        case let stringVal as String:
            try container.encode(stringVal)
        case let arrayVal as [Any]:
            try container.encode(arrayVal.map { AnyCodable($0) })
        case let dictVal as [String: Any]:
            try container.encode(dictVal.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }

    var stringValue: String? {
        value as? String
    }

    var description: String {
        if let s = value as? String { return s }
        if let data = try? JSONSerialization.data(withJSONObject: value, options: .prettyPrinted),
           let s = String(data: data, encoding: .utf8) {
            return s
        }
        return String(describing: value)
    }
}
