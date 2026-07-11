//
//  RelayWebSocket.swift
//  PersonalAgentRemote
//
//  WebSocket 连接管理，支持自动重连+心跳。
//  使用原生 URLSessionWebSocketTask，不依赖第三方 SDK。
//

import Foundation

// MARK: - WebSocket 事件代理

protocol RelayWebSocketDelegate: AnyObject {
    func didConnect()
    func didDisconnect(error: Error?)
    func didReceiveMessage(_ data: Data)
}

// MARK: - RelayWebSocket

class RelayWebSocket: NSObject {
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private let serverUrl: String
    private let token: String
    private var heartbeatTimer: Timer?
    private var reconnectTimer: Timer?
    private var reconnectAttempts = 0
    private var isManualClose = false
    private let heartbeatInterval: TimeInterval = 30.0

    weak var delegate: RelayWebSocketDelegate?
    var isConnected: Bool {
        webSocketTask?.state == .running
    }

    init(serverUrl: String, token: String) {
        self.serverUrl = serverUrl
        self.token = token
        super.init()
    }

    // MARK: - 连接

    func connect() {
        isManualClose = false
        guard let url = URL(string: "\(serverUrl)?token=\(token)") else {
            delegate?.didDisconnect(error: RelayError.invalidUrl)
            return
        }

        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        urlSession = URLSession(configuration: config, delegate: self, delegateQueue: nil)

        webSocketTask = urlSession?.webSocketTask(with: url)
        webSocketTask?.resume()

        receiveMessage()
        startHeartbeat()
    }

    func disconnect() {
        isManualClose = true
        stopHeartbeat()
        stopReconnect()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
    }

    // MARK: - 发送

    func send(_ data: Data) {
        guard let task = webSocketTask else { return }
        task.send(.data(data)) { [weak self] error in
            if let error = error {
                print("[WebSocket] Send error: \(error.localizedDescription)")
                self?.delegate?.didDisconnect(error: error)
            }
        }
    }

    func sendText(_ text: String) {
        guard let task = webSocketTask else { return }
        task.send(.string(text)) { [weak self] error in
            if let error = error {
                print("[WebSocket] Send error: \(error.localizedDescription)")
                self?.delegate?.didDisconnect(error: error)
            }
        }
    }

    // MARK: - 接收

    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let message):
                switch message {
                case .data(let data):
                    self.delegate?.didReceiveMessage(data)
                case .string(let text):
                    if let data = text.data(using: .utf8) {
                        self.delegate?.didReceiveMessage(data)
                    }
                @unknown default:
                    break
                }
                self.receiveMessage()

            case .failure(let error):
                print("[WebSocket] Receive error: \(error.localizedDescription)")
                self.delegate?.didDisconnect(error: error)
                self.scheduleReconnect()
            }
        }
    }

    // MARK: - 心跳

    private func startHeartbeat() {
        stopHeartbeat()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: heartbeatInterval, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            let heartbeat: [String: Any] = [
                "type": "heartbeat",
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]
            if let data = try? JSONSerialization.data(withJSONObject: heartbeat) {
                self.send(data)
            }
        }
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    // MARK: - 重连

    private func scheduleReconnect() {
        guard !isManualClose else { return }
        stopReconnect()

        reconnectAttempts += 1
        let delay = min(5.0 * Double(reconnectAttempts), 60.0)
        print("[WebSocket] Reconnecting in \(Int(delay))s (attempt \(reconnectAttempts))...")

        reconnectTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            self?.reconnectTimer = nil
            self?.connect()
        }
    }

    private func stopReconnect() {
        reconnectTimer?.invalidate()
        reconnectTimer = nil
    }
}

// MARK: - URLSessionWebSocketDelegate

extension RelayWebSocket: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocol: String?) {
        print("[WebSocket] Connected")
        reconnectAttempts = 0
        delegate?.didConnect()
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
                    reason: Data?) {
        print("[WebSocket] Disconnected: \(closeCode.rawValue)")
        stopHeartbeat()
        delegate?.didDisconnect(error: nil)
        if !isManualClose {
            scheduleReconnect()
        }
    }
}

// MARK: - Errors

enum RelayError: Error, LocalizedError {
    case invalidUrl
    case notConnected
    case invalidMessage

    var errorDescription: String? {
        switch self {
        case .invalidUrl: return "Invalid server URL"
        case .notConnected: return "Not connected to relay server"
        case .invalidMessage: return "Invalid message format"
        }
    }
}
