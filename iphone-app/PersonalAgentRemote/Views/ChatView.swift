//
//  ChatView.swift
//  PersonalAgentRemote
//

import SwiftUI

struct ChatView: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @FocusState private var inputIsFocused: Bool
    @State private var showSessionList = false

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                statusBar
                messageList
                if let error = chatVM.errorMessage {
                    Text(error).foregroundColor(.red).font(.caption).padding(.horizontal)
                }
                inputBar
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { showSessionList = true }) {
                        Image(systemName: "list.bullet")
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text(chatVM.currentSessionId.isEmpty ? "Personal Agent" : "Session")
                        .font(.headline)
                }
            }
        }
        .sheet(item: $chatVM.pendingPermission) { pending in
            PermissionView(pending: pending) { allow in
                chatVM.respondToPermission(allow: allow)
            }
        }
        .onAppear { chatVM.connect() }
        .onDisappear { chatVM.disconnect() }
        .sheet(isPresented: $showSessionList) {
            SessionListView()
        }
    }

    private var statusBar: some View {
        HStack {
            Circle().fill(statusColor).frame(width: 10, height: 10)
            Text(statusText).font(.caption).foregroundColor(.secondary)
            Spacer()
            if chatVM.isWaitingForResponse {
                Button(action: { chatVM.sendInterrupt() }) {
                    Image(systemName: "stop.circle.fill").foregroundColor(.red).font(.title2)
                }
            }
        }
        .padding(.horizontal).padding(.vertical, 8)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(chatVM.messages) { msg in
                        MessageBubble(message: msg).id(msg.id)
                    }
                }
                .padding()
            }
            .onChange(of: chatVM.messages.count) { _ in
                if let lastId = chatVM.messages.last?.id {
                    withAnimation { proxy.scrollTo(lastId, anchor: .bottom) }
                }
            }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Type a message...", text: $chatVM.inputText, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)
                .focused($inputIsFocused)
            Button(action: { chatVM.sendMessage() }) {
                Image(systemName: "paperplane.fill")
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.accentColor)
                    .clipShape(Circle())
            }
            .disabled(chatVM.inputText.trimmingCharacters(in: .whitespaces).isEmpty ||
                      chatVM.connectionState != .connected)
        }
        .padding()
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

struct MessageBubble: View {
    let message: AgentMessage

    var body: some View {
        HStack {
            if message.role == .user { Spacer() }
            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .font(.body)
                    .padding(12)
                    .background(bubbleColor)
                    .foregroundColor(textColor)
                    .cornerRadius(16)
                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            if message.role != .user { Spacer() }
        }
    }

    private var bubbleColor: Color {
        switch message.role {
        case .user: return Color.accentColor
        case .assistant: return Color(.systemGray6)
        case .system: return Color(.systemGray5)
        }
    }

    private var textColor: Color {
        message.role == .user ? .white : .primary
    }
}
