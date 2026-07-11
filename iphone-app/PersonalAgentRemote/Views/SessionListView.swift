//
//  SessionListView.swift
//  PersonalAgentRemote
//

import SwiftUI

struct SessionListView: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            List {
                if chatVM.sessions.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "tray").font(.system(size: 40)).foregroundColor(.secondary)
                        Text("No active sessions").foregroundColor(.secondary)
                        Text("Start a session on your PC:\npa remote-relay").font(.caption).foregroundColor(.secondary).multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 40).listRowBackground(Color.clear)
                } else {
                    ForEach(chatVM.sessions) { session in
                        SessionRow(session: session, isSelected: session.sessionId == chatVM.currentSessionId)
                            .onTapGesture { chatVM.currentSessionId = session.sessionId; dismiss() }
                    }
                }
            }
            .navigationTitle("Sessions")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink(destination: SettingsView()) { Image(systemName: "gearshape") }
                }
            }
            .refreshable { requestSessionList() }
            .onAppear { requestSessionList() }
        }
    }

    private func requestSessionList() {
        guard let serverUrl = AuthService.shared.serverUrl,
              let token = AuthService.shared.token,
              let url = URL(string: "\(serverUrl)/api/sessions") else { return }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(for: request)
                let result = try JSONDecoder().decode(SessionListResponse.self, from: data)
                await MainActor.run {
                    chatVM.sessions = result.sessions
                    if chatVM.currentSessionId.isEmpty, let first = result.sessions.first {
                        chatVM.currentSessionId = first.sessionId
                    }
                }
            } catch { print("[SessionList] Fetch error: \(error)") }
        }
    }
}

struct SessionListResponse: Codable {
    let success: Bool
    let sessions: [SessionInfo]
}

struct SessionRow: View {
    let session: SessionInfo
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            Circle().fill(statusColor).frame(width: 12, height: 12)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(session.workDir.components(separatedBy: "/").last ?? session.workDir).font(.headline)
                    if session.isBusy { ProgressView().progressViewStyle(.circular).scaleEffect(0.6) }
                }
                if let preview = session.lastUserMessagePreview {
                    Text(preview).font(.caption).foregroundColor(.secondary).lineLimit(1)
                }
                Text(timeAgo(session.lastActiveAt)).font(.caption2).foregroundColor(.secondary)
            }
            Spacer()
            if isSelected { Image(systemName: "checkmark.circle.fill").foregroundColor(.accentColor) }
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch session.status {
        case "active": return .green
        case "idle": return .yellow
        default: return .gray
        }
    }

    private func timeAgo(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        return "\(Int(interval / 86400))d ago"
    }
}
