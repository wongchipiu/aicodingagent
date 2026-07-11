//
//  PermissionView.swift
//  PersonalAgentRemote
//

import SwiftUI

struct PermissionView: View {
    let pending: ChatViewModel.PendingPermission
    let onRespond: (Bool) -> Void

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                Image(systemName: "shield.lefthalf.filled")
                    .font(.system(size: 56))
                    .foregroundColor(.orange)
                    .padding(.top, 40)

                Text("Permission Request").font(.title2).fontWeight(.bold)
                Text("Agent wants to use a tool:").foregroundColor(.secondary)

                VStack(spacing: 12) {
                    HStack {
                        Text("Tool").font(.caption).foregroundColor(.secondary)
                        Spacer()
                        Text(pending.toolName).fontWeight(.medium)
                    }
                    Divider()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Input").font(.caption).foregroundColor(.secondary)
                        ScrollView {
                            Text(formatInput())
                                .font(.system(.body, design: .monospaced))
                                .padding(8)
                                .background(Color(.systemGray6))
                                .cornerRadius(8)
                        }
                        .frame(maxHeight: 200)
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)
                .padding(.horizontal)

                Spacer()

                HStack(spacing: 16) {
                    Button(action: { onRespond(false) }) {
                        Text("Deny").fontWeight(.semibold)
                            .frame(maxWidth: .infinity).padding()
                            .background(Color.red.opacity(0.1))
                            .foregroundColor(.red).cornerRadius(12)
                    }
                    Button(action: { onRespond(true) }) {
                        Text("Allow").fontWeight(.semibold)
                            .frame(maxWidth: .infinity).padding()
                            .background(Color.green.opacity(0.1))
                            .foregroundColor(.green).cornerRadius(12)
                    }
                }
                .padding(.horizontal).padding(.bottom, 24)
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func formatInput() -> String {
        var lines: [String] = []
        for (key, value) in pending.input.sorted(by: { $0.key < $1.key }) {
            lines.append("\(key): \(value.description)")
        }
        return lines.joined(separator: "\n")
    }
}
