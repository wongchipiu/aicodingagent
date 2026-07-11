# iPhone 远程控制 Personal Agent — 完整集成指南

## 1. 系统架构

```
iPhone App (SwiftUI) <--WSS--> Relay Server (Node.js) <--WSS--> CLI (Personal Agent)
                                                                              |
                                                                              v
                                                                         LLM API
                                                                      (OpenAI/Ollama)
```

### 三端组件

| 组件 | 技术栈 | 文件数 | 关键功能 |
|------|--------|--------|----------|
| **iPhone App** | SwiftUI + iOS 17 | 12 Swift | 对话/权限/会话/设置/通知 |
| **Relay Server** | Node.js + ws + Express | 6 TS | HTTP API + WebSocket Hub + JWT |
| **CLI Connector** | TypeScript + Bun/Node | 7 TS | WS 客户端 + 消息注入 + 权限桥 |
| **Shared Types** | TypeScript | 3 TS | AgentMessage 协议定义 |

## 2. 消息协议 (AgentMessage)

消息通过 JSON over WebSocket 传输，所有消息共享同一 `type` 字段。

### 消息类型清单

| Type | 方向 | 说明 |
|------|------|------|
| `user` | iPhone → CLI | 用户输入消息 |
| `interrupt` | iPhone → CLI | 中断当前 turn |
| `control_request` | CLI → iPhone | 权限请求（can_use_tool） |
| `control_response` | iPhone → CLI | 权限审批结果 |
| `assistant_chunk` | CLI → iPhone | 流式文本块（增量） |
| `assistant_message` | CLI → iPhone | 完整消息 |
| `tool_use_start` | CLI → iPhone | 工具调用开始 |
| `tool_use_end` | CLI → iPhone | 工具调用结束 |
| `result` | CLI → iPhone | 回合结果 |
| `system` | 双向 | 系统通知 |
| `heartbeat` | 双向 | 心跳保活 |
| `heartbeat_ack` | 双向 | 心跳响应 |
| `session_list` | Server → iPhone | 会话列表 |

### 消息示例

**用户消息 (iPhone → CLI):**
```json
{
  "type": "user",
  "session_id": "uuid-xxx",
  "message": { "role": "user", "content": "请帮我修复这个 bug" },
  "parent_tool_use_id": null
}
```

**权限请求 (CLI → iPhone):**
```json
{
  "type": "control_request",
  "request_id": "req-uuid",
  "session_id": "uuid-xxx",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Bash",
    "input": { "command": "rm -rf node_modules" },
    "tool_use_id": "tool-uuid"
  }
}
```

**权限响应 (iPhone → CLI):**
```json
{
  "type": "control_response",
  "session_id": "uuid-xxx",
  "response": {
    "subtype": "success",
    "request_id": "req-uuid",
    "response": { "behavior": "deny", "message": "Operation too dangerous" }
  }
}
```

**流式分块 (CLI → iPhone):**
```json
{
  "type": "assistant_chunk",
  "session_id": "uuid-xxx",
  "content": "让我分析一下...",
  "is_final": false
}
```

## 3. 核心数据流

### 3.1 消息流转（iPhone → CLI → LLM → iPhone）

```
iPhone: 用户输入
  → ChatViewModel.sendMessage()
  → WebSocket.send(JSON)
  → Relay Server
  → messageRouter.routeFromIPhone()
  → sendToConnection(cliConnId)
  → CLI: RelayConnector.onUserMessage()
  → RelaySessionManager.handleUserMessage()
  → messageQueueManager.enqueue({ priority: 'now', skipSlashCommands: true })
  → queryLoop (next turn) → drain 队列 → 调用 LLM
  → query() yields AssistantMessage/StreamEvent
  → RelaySessionManager.forwardStreamEvent()
  → RelayConnector.sendAssistantChunk()
  → Relay Server → iPhone
  → ChatViewModel.handleAssistantChunk()
  → @Published messages 触发 UI 更新
```

### 3.2 权限审批流

```
Agent 调用 BashTool
  → canUseTool() 返回 'ask' (本地规则未匹配)
  → createRelayCanUseTool() 拦截
  → RelayPermissionBridge.requestPermission()
  → 生成 requestId, 创建 Promise
  → WebSocket → Relay → iPhone
  → ChatViewModel.handleControlRequest() → pendingPermission
  → PermissionView sheet 弹出
  → 用户点击 Allow/Deny
  → respondToPermission()
  → WebSocket → Relay → CLI
  → RelayPermissionBridge 解析 Promise
  → canUseTool 返回 PermissionDecision
  → 工具执行 / 抛出错误
```

### 3.3 中断流

```
iPhone: stop 按钮
  → ChatViewModel.sendInterrupt()
  → WebSocket.send({ type: 'interrupt', session_id })
  → CLI: RelaySessionManager.handleInterrupt()
  → abortController.abort('interrupt')
  → query() 检测 signal.aborted, 退出循环
```

## 4. 关键文件索引

### 中继服务器 (relay/)
- `src/server.ts` - HTTP API + WebSocket Hub 入口
- `src/auth.ts` - JWT 签发/验证 + 配对码
- `src/sessionStore.ts` - 会话生命周期
- `src/messageRouter.ts` - CLI↔iPhone 路由
- `test/e2e.ts` - 端到端测试 (15 个用例)

### CLI 端 (restored-src/src/relay/)
- `relayConnector.ts` - WebSocket 客户端 (重连+心跳)
- `relaySessionManager.ts` - 整合层 (消息注入+流式转发)
- `relayPermissionBridge.ts` - 权限请求 → iPhone
- `relayCanUseTool.ts` - canUseTool 包装器
- `relayAuth.ts` - HTTP API 客户端
- `relayConfig.ts` - 环境变量读取

### CLI 命令 (restored-src/src/cli/handlers/)
- `remoteRelay.ts` - `pa remote-relay` 命令处理器

### iPhone App (iphone-app/)
- `PersonalAgentApp.swift` - App 入口
- `Models/AgentMessage.swift` - 消息模型
- `Services/RelayWebSocket.swift` - WebSocket + 重连
- `Services/AuthService.swift` - 配对码认证
- `Services/NotificationService.swift` - iOS 推送
- `ViewModels/ChatViewModel.swift` - 对话逻辑
- `Views/{Content,Login,Chat,Permission,SessionList,Settings}View.swift`

## 5. 部署与运行

### 5.1 启动中继服务器

```bash
cd relay
PA_RELAY_KEY=your-secret npm start
```

或 Docker 部署:
```bash
docker compose up -d
```

健康检查:
```bash
curl http://localhost:7780/health
```

### 5.2 启动 CLI 端

```bash
export PA_RELAY_URL=http://your-relay-server:7780
export PA_RELAY_KEY=your-secret

pa remote-relay --pair  # 生成配对码
```

### 5.3 iPhone App 构建

在 macOS 上:
```bash
cd iphone-app
open Package.swift  # Xcode 自动打开
# 连接 iPhone，Cmd+R 运行
```

### 5.4 配对使用流程

1. PC 启动 relay 服务器
2. PC 启动 CLI 并运行 `pa remote-relay --pair`，获取 6 位配对码
3. iPhone App 输入 Server URL + Pair Code
4. 配对成功，开始对话

## 6. 测试

```bash
cd relay
PA_RELAY_KEY=e2e-test-key npm start &
sleep 3
npm run test:e2e

# 预期: Total: 15 | Passed: 15 | Failed: 0
```

测试覆盖:
- HTTP API: 健康检查、注册（有效/无效密钥）、配对码、客户端配对、会话创建
- WebSocket: 连接（CLI/iPhone）、未授权拒绝
- 消息路由: 用户消息双向、权限请求/响应、流式分块、心跳握手

## 7. 去 Anthropic 化清单

| 禁止项 | 状态 | 替代实现 |
|--------|------|----------|
| Anthropic Claude API | ✅ 避免 | OpenAI / Ollama / DeepSeek 任意 |
| Anthropic OAuth | ✅ 避免 | JWT + 配对码自建认证 |
| Anthropic CCR 云桥 | ✅ 避免 | 自建 WebSocket 中继 |
| Anthropic Environments API | ✅ 避免 | 中继自建会话管理 |
| Anthropic WebSocket | ✅ 避免 | 中继自建 WS 路由 |
| GrowthBook Feature Flags | ✅ 避免 | 环境变量配置 |
| `anthropic-version` HTTP 头 | ✅ 避免 | 自定义 `Authorization: Bearer` |
| `SDKMessage` 类型 | ✅ 避免 | 自定义 `AgentMessage` |
| `smartagent` 命令名 | ✅ 避免 | `pa` 命令 |
| `isSmartAgentAISubscriber()` | ✅ 避免 | 完全移除订阅检查 |

## 8. 未来增强 (Phase 3+)

- [ ] APNs 真实推送（需要 Apple Developer 账号 + 推送证书）
- [ ] 多会话并行（一个 CLI 多个 iPhone 端）
- [ ] 文件预览（iPhone 查看 Agent 读取的图片/PDF）
- [ ] 远程命令快捷面板（一键执行 /review, /commit 等）
- [ ] 端到端加密（mTLS 或 Noise Protocol）
