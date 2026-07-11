//
//  AuthService.swift
//  PersonalAgentRemote
//
//  认证服务 — 通过配对码获取 JWT，完全不依赖第三方 OAuth。
//

import Foundation

struct PairResponse: Codable {
    let success: Bool
    let token: String?
    let cliClientId: String?
    let expiresAt: Double?
    let error: String?
    let code: String?
}

class AuthService {
    static let shared = AuthService()

    private let userDefaults = UserDefaults.standard
    private let tokenKey = "pa_relay_token"
    private let serverUrlKey = "pa_relay_server_url"
    private let cliClientIdKey = "pa_relay_cli_client_id"

    var token: String? {
        get { userDefaults.string(forKey: tokenKey) }
        set { userDefaults.set(newValue, forKey: tokenKey) }
    }

    var serverUrl: String? {
        get { userDefaults.string(forKey: serverUrlKey) }
        set { userDefaults.set(newValue, forKey: serverUrlKey) }
    }

    var cliClientId: String? {
        get { userDefaults.string(forKey: cliClientIdKey) }
        set { userDefaults.set(newValue, forKey: cliClientIdKey) }
    }

    var isAuthenticated: Bool {
        token != nil && serverUrl != nil
    }

    func pair(serverUrl: String, pairCode: String, deviceName: String) async throws -> PairResponse {
        guard let url = URL(string: "\(serverUrl)/api/iphone/pair") else {
            throw RelayError.invalidUrl
        }

        let deviceUuid = getDeviceUuid()
        let body: [String: String] = [
            "pairCode": pairCode,
            "deviceUuid": deviceUuid,
            "deviceName": deviceName,
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let _ = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        let result = try JSONDecoder().decode(PairResponse.self, from: data)

        if result.success {
            self.serverUrl = serverUrl
            self.token = result.token
            self.cliClientId = result.cliClientId
        }

        return result
    }

    func logout() {
        token = nil
        serverUrl = nil
        cliClientId = nil
    }

    private func getDeviceUuid() -> String {
        let key = "pa_device_uuid"
        if let existing = userDefaults.string(forKey: key) {
            return existing
        }
        let uuid = UUID().uuidString
        userDefaults.set(uuid, forKey: key)
        return uuid
    }
}
