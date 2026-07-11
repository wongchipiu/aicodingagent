//
//  SettingsView.swift
//  PersonalAgentRemote
//

import SwiftUI

struct SettingsView: View {
    @State private var serverUrl: String = AuthService.shared.serverUrl ?? ""
    @State private var notificationsEnabled: Bool = UserDefaults.standard.object(forKey: "pa_notifications_enabled") as? Bool ?? true
    @State private var showLogoutConfirm: Bool = false
    @EnvironmentObject var chatVM: ChatViewModel
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Connection")) {
                    HStack {
                        Text("Server URL")
                        Spacer()
                        Text(serverUrl.isEmpty ? "Not set" : serverUrl)
                            .foregroundColor(.secondary).font(.caption).lineLimit(1)
                    }
                    HStack {
                        Text("Status")
                        Spacer()
                        HStack(spacing: 6) {
                            Circle().fill(statusColor).frame(width: 8, height: 8)
                            Text(statusText).font(.caption)
                        }
                    }
                    HStack {
                        Text("CLI Client ID")
                        Spacer()
                        Text(AuthService.shared.cliClientId ?? "Unknown")
                            .foregroundColor(.secondary).font(.caption)
                            .lineLimit(1).truncationMode(.middle)
                    }
                }

                Section(header: Text("Notifications")) {
                    Toggle("Permission Request Alerts", isOn: $notificationsEnabled)
                        .onChange(of: notificationsEnabled) { newVal in
                            UserDefaults.standard.set(newVal, forKey: "pa_notifications_enabled")
                            if newVal {
                                NotificationService.shared.requestPermission()
                            }
                        }
                    Text("When enabled, you'll receive push notifications when Agent requests tool permission.")
                        .font(.caption).foregroundColor(.secondary)
                }

                Section(header: Text("About")) {
                    HStack { Text("Version"); Spacer(); Text("1.0.0").foregroundColor(.secondary) }
                    HStack { Text("Protocol"); Spacer(); Text("AgentMessage v1").foregroundColor(.secondary) }
                }

                Section {
                    Button(role: .destructive) {
                        showLogoutConfirm = true
                    } label: {
                        HStack { Spacer(); Text("Unpair & Logout"); Spacer() }
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("Unpair?", isPresented: $showLogoutConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Unpair", role: .destructive) {
                    chatVM.disconnect()
                    AuthService.shared.logout()
                    dismiss()
                }
            } message: {
                Text("This will remove the pairing with your CLI. You'll need to generate a new pair code to reconnect.")
            }
        }
    }

    private var statusColor: Color {
        switch chatVM.connectionState {
        case .connected: return .green
        case .connecting: return .orange
        case .disconnected: return .gray
        }
    }

    private var statusText: String {
        switch chatVM.connectionState {
        case .connected: return "Connected"
        case .connecting: return "Connecting..."
        case .disconnected: return "Disconnected"
        }
    }
}
