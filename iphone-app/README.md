# Personal Agent Remote — iPhone App

SwiftUI 原生应用，通过自建中继服务器远程控制桌面端 Personal Agent。

## 功能

- 实时对话：发送消息给 Agent，接收流式回复
- 权限审批：Agent 执行工具时弹窗确认/拒绝
- 中断请求：停止 Agent 当前操作
- 自动重连：断线自动重连+心跳保活

## 构建

### 前置要求

- macOS 14.0+
- Xcode 15.0+
- iOS 17.0+ 设备或模拟器
- Apple Developer 账号（个人即可）

### 步骤

1. 用 Xcode 打开 `PersonalAgentRemote.xcodeproj`
2. 配置 Signing & Capabilities（选择你的 Apple ID）
3. 连接 iPhone，选择设备
4. 点击 Run (Cmd+R)

### 配对流程

1. 在 PC 上启动中继服务器和 CLI：
   ```bash
   cd relay
   PA_RELAY_KEY=your-secret npm start

   PA_RELAY_URL=http://your-pc-ip:7780 PA_RELAY_KEY=your-secret \
     pa remote-relay --pair
   ```

2. 在 iPhone App 中输入 Server URL 和 Pair Code
3. 配对成功后即可开始对话

## 架构

```
iPhone App (SwiftUI)
├── Models/AgentMessage.swift         # 消息类型定义
├── Services/
│   ├── RelayWebSocket.swift          # WebSocket 连接管理
│   └── AuthService.swift             # JWT 认证（配对码）
├── ViewModels/ChatViewModel.swift     # 对话逻辑
└── Views/
    ├── ContentView.swift             # 主界面路由
    ├── LoginView.swift               # 配对登录
    ├── ChatView.swift                # 对话界面
    └── PermissionView.swift          # 权限审批弹窗
```

零第三方依赖，纯原生 SwiftUI + URLSessionWebSocketTask。
