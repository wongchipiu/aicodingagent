// swift-tools-version:5.9
// Personal Agent Remote iPhone App
// 使用方法: 在 macOS 上执行 `swift build` 或在 Xcode 中打开 Package.swift

import PackageDescription

let package = Package(
    name: "PersonalAgentRemote",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .executable(
            name: "PersonalAgentRemote",
            targets: ["PersonalAgentRemote"]
        )
    ],
    targets: [
        .executableTarget(
            name: "PersonalAgentRemote",
            path: "PersonalAgentRemote",
            sources: [
                "PersonalAgentApp.swift",
                "Models/AgentMessage.swift",
                "Services/AuthService.swift",
                "Services/NotificationService.swift",
                "Services/RelayWebSocket.swift",
                "ViewModels/ChatViewModel.swift",
                "Views/ContentView.swift",
                "Views/LoginView.swift",
                "Views/ChatView.swift",
                "Views/PermissionView.swift",
                "Views/SessionListView.swift",
                "Views/SettingsView.swift"
            ]
        )
    ]
)
