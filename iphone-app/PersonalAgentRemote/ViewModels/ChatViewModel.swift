//
//  ChatViewModel.swift
//  PersonalAgentRemote
//
//  对话 ViewModel — 管理消息列表、WebSocket 通信、权限审批。
//

import Foundation
import SwiftUI

@MainActor
class ChatViewModel: ObservableObject, RelayWebSocketDelegate {
    @Published var messages: [AgentMessage] = []
    @Published var connectionState: ConnectionState = .disconnected
    @Published var inputText: String = ""
    @Published var isWaitingForResponse: Bool = false
    @Published var pendingPermission: PendingPermission?
    @Published var sessions: [SessionInfo] = []
    @Published var currentSessionId: String = ""
    @Published var errorMessage: String?

    enum ConnectionState {
        case disconnected
        case connecting
        case connected
    }

    struct PendingPermission: Identifiable {
        let id: String
        let requestId: String
        let toolName: String
        let input: [String: AnyCodable]
        let toolUseId: String
    }

    private var webSocket: RelayWebSocket?

    func connect() {
        guard let serverUrl = AuthService.shared.serverUrl,
              let token = AuthService.shared.token else {
            errorMessage = "Not authenticated. Please pair with CLI first."
            return
        }

        let wsUrl = serverUrl
            .replacingOccurrences(of: "http://", with: "ws://")
            .replacingOccurrences(of: "https://", with: "wss://") + "/ws"

        connectionState = .connecting
        webSocket = RelayWebSocket(serverUrl: wsUrl, token: token)
        webSocket?.delegate = self
        webSocket?.connect()
    }

    func disconnect() {
        webSocket?.disconnect()
        webSocket = nil
        connectionState = .disconnected
    }

    nonisolated func didConnect() {
        Task { @MainActor in
            self.connectionState = .connected
            self.errorMessage = nil
        }
    }

    nonisolated func didDisconnect(error: Error?) {
        Task { @MainActor in
            self.connectionState = .disconnected
            if let error = error {
                self.errorMessage = "Disconnected: \(error.localizedDescription)"
            }
        }
    }

    nonisolated func didReceiveMessage(_ data: Data) {
        Task { @MainActor in
            self.handleMessage(data)
        }
    }

    private func handleMessage(_ data: Data) {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        switch type {
        case "assistant_chunk": handleAssistantChunk(json)
        case "assistant_message": handleAssistantMessage(json)
        case "tool_use_start": handleToolUseStart(json)
        case "tool_use_end": handleToolUseEnd(json)
        case "result": handleResult(json)
        case "system": handleSystem(json)
        case "control_request": handleControlRequest(json)
        case "session_list": handleSessionList(json)
        case "heartbeat_ack": break
        default: print("[ChatVM] Unknown message type: \(type)")
        }
    }

    private func handleAssistantChunk(_ json: [String: Any]) {
        guard let content = json["content"] as? String else { return }
        let isFinal = json["is_final"] as? Bool ?? false

        if let lastIdx = messages.indices.last,
           messages[lastIdx].role == .assistant && messages[lastIdx].isStreaming {
            messages[lastIdx].content += content
            if isFinal {
                messages[lastIdx].isStreaming = false
            }
        } else {
            let msg = AgentMessage(
                id: UUID().uuidString, role: .assistant, content: content,
                timestamp: Date(), isStreaming: !isFinal, toolUseName: nil)
            messages.append(msg)
        }
    }

    private func handleAssistantMessage(_ json: [String: Any]) {
        guard let message = json["message"] as? [String: Any],
              let content = message["content"] else { return }

        let text: String
        if let s = content as? String { text = s }
        else if let arr = content as: [[String: Any]] {
            text = arr.compactMap { $0["text"] as? String }.joined()
        } else { text = String(describing: content) }

        messages.append(AgentMessage(
            id: UUID().uuidString, role: .assistant, content: text,
            timestamp: Date(), isStreaming: false, toolUseName: nil))
    }

    private func handleToolUseStart(_ json: [String: Any]) {
        let toolName = json["tool_name"] as? String ?? "unknown"
        messages.append(AgentMessage(
            id: UUID().uuidString, role: .system, content: "Using tool: \(toolName)",
            timestamp: Date(), isStreaming: false, toolUseName: toolName))
    }

    private func handleToolUseEnd(_ json: [String: Any]) {}

    private func handleResult(_ json: [String: Any]) {
        isWaitingForResponse = false
        if (json["subtype"] as? String) == "error" {
            errorMessage = "Error: \(json["error_message"] as? String ?? "Unknown")"
        }
    }

    private func handleSystem(_ json: [String: Any]) {
        if (json["subtype"] as? String) == "init" { return }
        let message = json["message"] as? String ?? ""
        messages.append(AgentMessage(
            id: UUID().uuidString, role: .system, content: message,
            timestamp: Date(), isStreaming: false, toolUseName: nil))
    }

    private func handleControlRequest(_ json: [String: Any]) {
        guard let request = json["request"] as? [String: Any],
              request["subtype"] as? String == "can_use_tool" else { return }

        let requestId = json["request_id"] as? String ?? UUID().uuidString
        let toolName = request["tool_name"] as? String ?? "unknown"
        let toolUseId = request["tool_use_id"] as? String ?? ""
        var input: [String: AnyCodable] = [:]
        if let rawInput = request["input"] as? [String: Any] {
            input = rawInput.mapValues { AnyCodable($0) }
        }

        pendingPermission = PendingPermission(
            id: requestId, requestId: requestId, toolName: toolName,
            input: input, toolUseId: toolUseId)

        // 发送本地通知（如果通知已开启且 App 不在前台）
        if let enabled = UserDefaults.standard.object(forKey: "pa_notifications_enabled") as? Bool, enabled {
            NotificationService.shared.sendPermissionRequestNotification(toolName: toolName)
        }
    }

    private func handleSessionList(_ json: [String: Any]) {
        guard let arr = json["sessions"] as? [[String: Any]] else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: arr)
            sessions = try JSONDecoder().decode([SessionInfo].self, from: data)
        } catch { print("[ChatVM] Parse sessions error: \(error)") }
    }

    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        messages.append(AgentMessage(
            id: UUID().uuidString, role: .user, content: text,
            timestamp: Date(), isStreaming: false, toolUseName: nil))

        let message: [String: Any] = [
            "type": "user", "session_id": currentSessionId,
            "message": ["role": "user", "content": text],
            "parent_tool_use_id": NSNull(),
        ]
        if let data = try? JSONSerialization.data(withJSONObject: message) {
            webSocket?.send(data)
            isWaitingForResponse = true
        }
        inputText = ""
    }

    func sendInterrupt() {
        let message: [String: Any] = ["type": "interrupt", "session_id": currentSessionId]
        if let data = try? JSONSerialization.data(withJSONObject: message) {
            webSocket?.send(data)
            isWaitingForResponse = false
        }
    }

    func respondToPermission(allow: Bool) {
        guard let pending = pendingPermission else { return }
        let behavior = allow ? "allow" : "deny"
        var responseData: [String: Any] = ["behavior": behavior]
        if !allow { responseData["message"] = "Denied by user on iPhone" }

        let message: [String: Any] = [
            "type": "control_response", "session_id": currentSessionId,
            "response": [
                "subtype": "success", "request_id": pending.requestId,
                "response": responseData,
            ],
        ]
        if let data = try? JSONSerialization.data(withJSONObject: message) {
            webSocket?.send(data)
        }

        let action = allow ? "Allowed" : "Denied"
        messages.append(AgentMessage(
            id: UUID().uuidString, role: .system, content: "\(action) tool: \(pending.toolName)",
            timestamp: Date(), isStreaming: false, toolUseName: nil))
        pendingPermission = nil
    }
}
