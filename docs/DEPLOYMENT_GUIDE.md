# Personal Agent — 部署/安装/使用手册

> 版本: v1.0 | 更新日期: 2026-07-11

---

## 目录

1. [系统架构总览](#1-系统架构总览)
2. [前置环境要求](#2-前置环境要求)
3. [组件一：中继服务器（Relay Server）部署](#3-组件一中继服务器relay-server部署)
4. [组件二：CLI Agent 安装与配置](#4-组件二cli-agent-安装与配置)
5. [组件三：iPhone App 构建与安装](#5-组件三iphone-app-构建与安装)
6. [首次配对流程](#6-首次配对流程)
7. [日常使用指南](#7-日常使用指南)
8. [环境变量完整参考](#8-环境变量完整参考)
9. [API 接口参考](#9-api-接口参考)
10. [故障排查](#10-故障排查)

---

## 1. 系统架构总览

```
┌─────────────┐    WebSocket (outbound)    ┌──────────────┐    WebSocket (outbound)    ┌──────────────┐
│   CLI PC    │◄─────────────────────────►│ Relay Server │◄─────────────────────────►│   iPhone    │
│  (Agent)    │                            │  (Node.js)   │                            │  (SwiftUI)   │
│             │                            │  自建 VPS     │                            │             │
│ LLM 调用:    │                            │ 自建认证     │                            │             │
│ OpenAI /    │                            │ 自建中继     │                            │             │
│ Ollama      │                            │              │                            │             │
└─────────────┘                            └──────────────┘                            └──────────────┘
```

**三端组件说明：**

| 组件 | 目录 | 技术栈 | 作用 |
|------|------|--------|------|
| 中继服务器 | `relay/` | Node.js + Express + ws + JWT | 桥接 CLI 和 iPhone 的 WebSocket 连接，路由消息 |
| CLI Agent | `restored-src/` | TypeScript (Node.js ≥ 18) | 运行 AI Agent，调用 LLM，执行工具 |
| iPhone App | `iphone-app/` | SwiftUI + iOS 17+ | 远程对话、权限审批、会话管理 |
| 共享类型 | `shared-types/` | TypeScript | 三端共用的消息协议定义 |

**核心设计原则：完全自主可控。** 自建认证、自建中继、自建消息协议。LLM Provider 完全用户自主（OpenAI / Ollama / DeepSeek / 任意 OpenAI 兼容 API）。

---

## 2. 前置环境要求

### 2.1 中继服务器

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | 18.0+ | 推荐 20.x LTS |
| npm | 10+ | 随 Node.js 安装 |
| Docker（可选） | 24+ | 仅 Docker 部署方式需要 |

### 2.2 CLI Agent

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | 18.0+ | 推荐 20.x LTS |
| npm / pnpm | 任意 | 安装依赖 |
| TypeScript | 5.4+ | 开发模式需要 |

### 2.3 iPhone App

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| macOS | 14.0+ | Xcode 运行环境 |
| Xcode | 15.0+ | 编译 Swift 代码 |
| iOS | 17.0+ | 部署目标 |
| Apple Developer 账号 | 个人即可 | 免费账号可侧载，付费可长期使用 |

### 2.4 LLM API Key（三选一）

```
# 方式 A: OpenAI
OPENAI_API_KEY=sk-xxxxx
API_BASE_URL=https://api.openai.com/v1

# 方式 B: Ollama（本地模型，无需 API Key）
OLLAMA_BASE_URL=http://localhost:11434
API_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama

# 方式 C: 任意 OpenAI 兼容 API（DeepSeek / Qwen / vLLM / LM Studio 等）
OPENAI_API_KEY=your-key
API_BASE_URL=https://api.deepseek.com/v1
```

---

## 3. 组件一：中继服务器（Relay Server）部署

中继服务器是三端通信的枢纽，需部署在 iPhone 和 CLI 都能访问的网络位置（VPS / 内网服务器 / 本机均可）。

### 方式 A：直接运行（开发/测试推荐）

```bash
# 1. 进入 relay 目录
cd relay

# 2. 安装依赖
npm install

# 3. 设置密钥并启动
#    Windows PowerShell:
$env:PA_RELAY_KEY="your-secret-key-change-me"
npm start

#    Linux / macOS:
PA_RELAY_KEY=your-secret-key-change-me npm start
```

启动成功后控制台显示：

```
╔══════════════════════════════════════════════╗
║   Personal Agent Relay Server v1.0.0         ║
╠══════════════════════════════════════════════╣
║  HTTP:   http://0.0.0.0:7780
║  WS:     ws://0.0.0.0:7780/ws?token=<JWT>
║  Health: http://0.0.0.0:7780/health
╚══════════════════════════════════════════════╝
```

### 方式 B：Docker 部署（生产推荐）

```bash
# 1. 构建镜像（在项目根目录执行）
docker build -t pa-relay -f relay/Dockerfile .

# 2. 运行容器
docker run -d \
  --name pa-relay \
  -p 7780:7780 \
  -e PA_RELAY_KEY=your-secret-key-change-me \
  -e PA_RELAY_PORT=7780 \
  -e PA_RELAY_HOST=0.0.0.0 \
  --restart unless-stopped \
  pa-relay
```

### 方式 C：Docker Compose 部署

在项目根目录创建 `docker-compose.yml`：

```yaml
services:
  relay:
    build:
      context: .
      dockerfile: relay/Dockerfile
    ports:
      - "7780:7780"
    environment:
      - PA_RELAY_KEY=your-secret-key-change-me
      - PA_RELAY_PORT=7780
      - PA_RELAY_HOST=0.0.0.0
      - PA_TOKEN_TTL_SEC=86400
      - PA_HEARTBEAT_TIMEOUT_SEC=90
      - PA_MAX_SESSIONS=10
    restart: unless-stopped
```

```bash
docker compose up -d
```

### 验证中继服务器

```bash
# 健康检查
curl http://<服务器IP>:7780/health

# 预期响应:
# {"status":"ok","connections":0,"sessions":0,"uptime":15}
```

> **安全提示**：生产环境请将 `PA_RELAY_KEY` 替换为强随机密钥（如 `openssl rand -hex 32`），不要使用默认值。如需公网暴露，建议配合 Nginx 反向代理 + TLS 证书（`wss://`）。

---

## 4. 组件二：CLI Agent 安装与配置

### 4.1 安装

```bash
# 1. 进入 CLI 源码目录
cd restored-src

# 2. 安装依赖
npm install
```

### 4.2 环境变量配置

在项目根目录复制并编辑 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入关键配置：

```bash
# === LLM Provider（必填一项） ===
OPENAI_API_KEY=sk-your-openai-api-key
API_BASE_URL=https://api.openai.com/v1

# === 中继服务器连接（远程控制必填） ===
# 中继服务器 HTTP 地址（如 http://192.168.1.100:7780 或 http://your-vps:7780）
PA_RELAY_URL=http://your-relay-server:7780
# 预共享密钥（必须与中继服务器 PA_RELAY_KEY 一致）
PA_RELAY_KEY=your-secret-key-change-me

# === 禁用遥测 ===
CLAUDE_CODE_ATTRIBUTION_HEADER=false
CLAUDE_CODE_SIMPLE=true
```

### 4.3 运行 CLI Agent

```bash
# 方式 1: 直接运行（交互模式，本地使用）
cd package
node cli.js

# 方式 2: 单次执行命令
node cli.js -p "帮我整理下载文件夹"

# 方式 3: 启动远程中继模式（iPhone 远程控制）
cd restored-src
npx tsx src/cli/handlers/remoteRelay.ts --pair
```

> **注意**：由于源码从 source map 还原，`restored-src/` 需要重新编译才能完整运行。`package/cli.js` 是原始编译版本可直接运行。如需在 `restored-src/` 上修改源码运行，需要配置 TypeScript 编译（推荐使用 `tsx` 直接运行 TS）。

---

## 5. 组件三：iPhone App 构建与安装

### 5.1 前置准备

- 一台 Mac 电脑（macOS 14.0+）
- 已安装 Xcode 15.0+
- 一台 iPhone（iOS 17.0+）
- Apple ID（免费 Developer 账号即可侧载，有效期 7 天；付费 Developer 账号有效期 1 年）

### 5.2 构建步骤

```
1. 打开 Finder，定位到 iphone-app/ 目录

2. 创建 Xcode 项目（首次需要）：
   - 打开 Xcode → File → New → Project
   - 选择 iOS → App
   - Product Name: PersonalAgentRemote
   - Interface: SwiftUI
   - Language: Swift
   - 保存到 iphone-app/ 目录

3. 将以下 Swift 源文件拖入 Xcode 项目：
   iphone-app/PersonalAgentRemote/
   ├── PersonalAgentApp.swift          (App 入口)
   ├── Models/AgentMessage.swift       (消息模型)
   ├── Services/
   │   ├── AuthService.swift           (配对认证)
   │   └── RelayWebSocket.swift        (WebSocket 连接)
   ├── ViewModels/ChatViewModel.swift   (对话逻辑)
   └── Views/
       ├── ContentView.swift           (主路由)
       ├── LoginView.swift             (配对登录)
       ├── ChatView.swift              (对话界面)
       └── PermissionView.swift        (权限审批)

4. 配置 Signing & Capabilities:
   - Xcode 左侧选中项目 → Signing & Capabilities
   - Team: 选择你的 Apple ID
   - Bundle Identifier: com.yourname.PersonalAgentRemote

5. 连接 iPhone:
   - 用数据线连接 iPhone 到 Mac
   - Xcode 顶部设备列表选择你的 iPhone
   - iPhone 上: 设置 → 隐私与安全 → 开发者模式 → 打开

6. 点击 Run (Cmd+R) 编译并安装
```

### 5.3 信任开发者证书（首次安装后）

安装后 App 图标可能显示"不受信任的开发者"：

```
iPhone → 设置 → 通用 → VPN与设备管理 → 找到你的 Apple ID → 点击"信任"
```

---

## 6. 首次配对流程

配对是一次性操作，完成后 iPhone 会记住设备绑定。

### 6.1 完整配对流程图

```
┌──────────┐                    ┌──────────────┐                    ┌──────────┐
│  CLI PC  │                    │ Relay Server │                    │  iPhone  │
└────┬─────┘                    └──────┬───────┘                    └────┬─────┘
     │                                 │                                 │
     │  ① PA_RELAY_URL + PA_RELAY_KEY  │                                 │
     │  pa remote-relay --pair         │                                 │
     │────────────────────────────────►│                                 │
     │  ② 注册成功，获取 JWT           │                                 │
     │◄────────────────────────────────│                                 │
     │  ③ 生成 6 位配对码              │                                 │
     │◄────────────────────────────────│                                 │
     │                                 │                                 │
     │  ④ 终端显示配对码               │                                 │
     │     ┌──────┐                    │                                 │
     │     │123456│                    │    ⑤ iPhone 输入 Server URL     │
     │     └──────┘                    │       + Pair Code              │
     │                                 │◄────────────────────────────────│
     │                                 │  ⑥ 验证配对码，签发 iPhone JWT  │
     │                                 │────────────────────────────────►│
     │                                 │  ⑦ 配对成功                     │
     │  ⑧ WebSocket 连接建立           │                                 │
     │◄────────────────────────────────│◄────────────────────────────────│
     │                                 │                                 │
     │  ⑨ 可以开始对话                 │                                 │
     │◄────────────────────────────────│◄────────────────────────────────│
```

### 6.2 具体操作步骤

**Step 1 — 启动中继服务器**（在 VPS 或本机）

```bash
cd relay
PA_RELAY_KEY=my-secret-2026 npm start
```

**Step 2 — 启动 CLI 并生成配对码**（在 PC 上）

```bash
cd restored-src

# 设置环境变量 (Windows PowerShell)
$env:PA_RELAY_URL="http://your-relay-server:7780"
$env:PA_RELAY_KEY="my-secret-2026"
$env:OPENAI_API_KEY="sk-your-openai-key"
$env:API_BASE_URL="https://api.openai.com/v1"

# 启动配对模式
npx tsx src/cli/handlers/remoteRelay.ts --pair
```

CLI 终端显示配对码：

```
🔌 Connecting to relay server: http://your-relay-server:7780
✅ Registered. Client ID: cli-DESKTOP-ABC-a1b2c3d4

📱 iPhone Pairing Code:
   ┌─────────────┐
   │  482917     │
   └─────────────┘

   Open your iPhone App and enter this code to pair.
   The code expires in 5 minutes.
   Waiting for iPhone to connect...
```

**Step 3 — iPhone 配对**

1. 打开 iPhone 上的 PersonalAgentRemote App
2. 在 LoginView 输入：
   - **Server URL**: `http://your-relay-server:7780`
   - **Pair Code**: `482917`（CLI 终端显示的 6 位码）
   - **Device Name**: 自动填充设备名，可修改
3. 点击 **"Pair with CLI"** 按钮
4. 配对成功后自动跳转到对话界面

**Step 4 — 验证连接**

CLI 终端显示：
```
🔗 Relay connection established. iPhone can now connect.
🚀 Personal Agent relay is running.
   Send messages from your iPhone app.
```

---

## 7. 日常使用指南

### 7.1 日常启动流程（配对已完成）

每次使用只需两步：

```bash
# 1. 确保中继服务器运行中（VPS 上 Docker 自启动，无需手动）

# 2. PC 上启动 CLI Agent（不需要 --pair）
cd restored-src
$env:PA_RELAY_URL="http://your-relay-server:7780"
$env:PA_RELAY_KEY="my-secret-2026"
$env:OPENAI_API_KEY="sk-your-openai-key"
npx tsx src/cli/handlers/remoteRelay.ts
```

打开 iPhone App，自动连接，即可开始对话。

### 7.2 iPhone App 功能

| 功能 | 操作方式 | 说明 |
|------|----------|------|
| 发送消息 | ChatView 输入框输入文字 → 发送 | 消息经中继到达 CLI → LLM → 回复推回 iPhone |
| 查看流式回复 | 自动显示 | Agent 回复实时增量渲染 |
| 权限审批 | 弹窗 → 允许/拒绝 | Agent 执行工具（如 Bash、文件操作）时弹出 |
| 中断操作 | 点击中断按钮 | 停止 Agent 当前执行 |
| 查看会话 | SessionListView | 查看活跃会话列表和状态 |
| 修改设置 | SettingsView | 修改中继地址、通知开关 |
| 退出登录 | Settings → Logout | 清除 token，需重新配对 |

### 7.3 权限审批机制

当 Agent 需要执行工具（如运行 Bash 命令、读写文件）时：

```
Agent 要执行: Bash("rm -rf /tmp/old-files")
       ↓
CLI RelayPermissionBridge 拦截
       ↓
中继服务器转发权限请求到 iPhone
       ↓
iPhone 弹出 PermissionView:
  ┌─────────────────────────────┐
  │ 🔐 Permission Request        │
  │                              │
  │ Tool: Bash                   │
  │ Input: rm -rf /tmp/old-files │
  │                              │
  │  [ Allow ]    [ Deny ]       │
  └─────────────────────────────┘
       ↓
用户点击 Allow / Deny
       ↓
响应经中继返回 CLI
       ↓
Agent 继续执行或中止
```

- **超时策略**：如果 2 分钟内无响应，自动 Deny
- **安全建议**：仔细审查命令内容后再允许，特别是涉及删除、网络请求的命令

### 7.4 多 LLM 切换

修改 PC 上的环境变量即可切换 LLM，无需重启中继服务器：

```bash
# 切换到 Ollama 本地模型
$env:OPENAI_API_KEY="ollama"
$env:API_BASE_URL="http://localhost:11434/v1"
$env:PA_MODEL="qwen2.5:14b"

# 切换到 DeepSeek
$env:OPENAI_API_KEY="your-deepseek-key"
$env:API_BASE_URL="https://api.deepseek.com/v1"
```

---

## 8. 环境变量完整参考

### 8.1 中继服务器 (`relay/`)

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PA_RELAY_KEY` | ✅ | `personal-agent-default-key-change-me` | 预共享密钥，CLI 和 iPhone 必须相同 |
| `PA_RELAY_PORT` | ❌ | `7780` | HTTP 监听端口 |
| `PA_RELAY_HOST` | ❌ | `0.0.0.0` | 监听地址 |
| `PA_TOKEN_TTL_SEC` | ❌ | `86400` | JWT 有效期（秒），默认 24h |
| `PA_HEARTBEAT_TIMEOUT_SEC` | ❌ | `90` | 心跳超时（秒），超时断开 |
| `PA_HEARTBEAT_CHECK_INTERVAL_SEC` | ❌ | `30` | 心跳检测间隔（秒） |
| `PA_PAIR_CODE_TTL_SEC` | ❌ | `300` | 配对码有效期（秒），默认 5min |
| `PA_MAX_SESSIONS` | ❌ | `10` | 最大并发会话数 |
| `PA_ENABLE_CORS` | ❌ | `true` | 是否启用 CORS |

### 8.2 CLI Agent (`restored-src/`)

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_API_KEY` | ✅ | LLM API Key（OpenAI / DeepSeek / Ollama 填 `ollama`） |
| `API_BASE_URL` | ✅ | LLM API 基地址 |
| `PA_RELAY_URL` | 远程控制必填 | 中继服务器地址（如 `http://192.168.1.100:7780`） |
| `PA_RELAY_KEY` | 远程控制必填 | 预共享密钥（与中继服务器一致） |
| `PA_MODEL` | ❌ | 默认模型名（如 `gpt-4o`、`qwen2.5:14b`） |
| `CLAUDE_CODE_ATTRIBUTION_HEADER` | ❌ | 设为 `false` 禁用遥测 |
| `CLAUDE_CODE_SIMPLE` | ❌ | 设为 `true` 简化模式 |

---

## 9. API 接口参考

### 9.1 CLI 注册

```
POST /api/cli/register
Content-Type: application/json

{
  "relayKey": "your-secret-key",
  "machineId": "my-pc-abc123",
  "version": "1.0.0"
}
```

响应：
```json
{
  "success": true,
  "token": "<JWT>",
  "clientId": "cli-...",
  "expiresAt": 1234567890000
}
```

### 9.2 生成配对码

```
POST /api/pair-code/generate
Authorization: Bearer <JWT>
```

响应：
```json
{ "success": true, "pairCode": "482917" }
```

### 9.3 iPhone 配对

```
POST /api/iphone/pair
Content-Type: application/json

{
  "pairCode": "482917",
  "deviceUuid": "iphone-uuid-xxx",
  "deviceName": "Bruce's iPhone"
}
```

响应：
```json
{
  "success": true,
  "token": "<JWT>",
  "cliClientId": "cli-...",
  "expiresAt": 1234567890000
}
```

### 9.4 会话列表

```
GET /api/sessions
Authorization: Bearer <JWT>
```

### 9.5 创建会话

```
POST /api/sessions
Authorization: Bearer <JWT>
Content-Type: application/json

{ "workDir": "/home/user/project" }
```

### 9.6 WebSocket 连接

```
WS /ws?token=<JWT>
```

连接后可双向收发 `AgentMessage` 格式的 JSON 消息，消息类型包括：

| type | 方向 | 说明 |
|------|------|------|
| `user` | iPhone → CLI | 用户输入消息 |
| `assistant_chunk` | CLI → iPhone | 流式文本块（增量） |
| `tool_use_start` | CLI → iPhone | 工具调用开始 |
| `tool_use_end` | CLI → iPhone | 工具调用结束 |
| `control_request` | CLI → iPhone | 权限请求 |
| `control_response` | iPhone → CLI | 权限审批结果 |
| `interrupt` | iPhone → CLI | 中断请求 |
| `result` | CLI → iPhone | 回合结束 |
| `system` | 双向 | 系统消息 |
| `heartbeat` | 双向 | 心跳 |

### 9.7 健康检查

```
GET /health

→ { "status": "ok", "connections": 2, "sessions": 1, "uptime": 3600 }
```

---

## 10. 故障排查

### 10.1 中继服务器

| 问题 | 排查方法 |
|------|----------|
| 启动报 `Missing required env: PA_RELAY_KEY` | 设置 `PA_RELAY_KEY` 环境变量 |
| iPhone 无法连接 | 检查防火墙是否放行 7780 端口；确认 `PA_RELAY_HOST=0.0.0.0` |
| WebSocket 连接被拒 | 确认 JWT token 未过期（默认 24h），重新注册获取新 token |
| 连接频繁断开 | 检查 `PA_HEARTBEAT_TIMEOUT_SEC` 是否过短，CLI/iPhone 心跳间隔为 30s |

### 10.2 CLI Agent

| 问题 | 排查方法 |
|------|----------|
| `Relay configuration not found` | 设置 `PA_RELAY_URL` 和 `PA_RELAY_KEY` 环境变量 |
| `Failed to register with relay server` | 确认中继服务器运行中、地址正确、密钥一致 |
| LLM 调用失败 | 检查 `OPENAI_API_KEY` 和 `API_BASE_URL` 是否正确 |
| `tsx` 命令不存在 | 运行 `npm install -g tsx` 或使用 `npx tsx` |

### 10.3 iPhone App

| 问题 | 排查方法 |
|------|----------|
| 配对失败 "Invalid pair code" | 配对码已过期（5分钟），在 CLI 重新执行 `--pair` 生成新码 |
| 无法连接服务器 | 确认 Server URL 格式正确（含 `http://` 前缀和端口号） |
| App 闪退 | 确认 iOS 17.0+；检查 Xcode Console 日志 |
| "不受信任的开发者" | 设置 → 通用 → VPN与设备管理 → 信任开发者证书 |
| 连接后无响应 | 确认 CLI 端 `remote-relay` 正在运行且 WebSocket 已连接 |

### 10.4 网络连通性测试

```bash
# 测试中继服务器是否可达
curl http://your-relay-server:7780/health

# 测试 WebSocket 连通性（使用 wscat）
npm install -g wscat
wscat -c "ws://your-relay-server:7780/ws?token=test"

# 查看 Docker 容器日志
docker logs pa-relay -f --tail 50
```

### 10.5 日志位置

| 组件 | 日志位置 |
|------|----------|
| 中继服务器 | 标准输出（Docker: `docker logs pa-relay`） |
| CLI Agent | 标准输出（终端控制台） |
| iPhone App | Xcode Console (Cmd+Shift+Y) |

---

## 附录：快速启动检查清单

```
□ 1. 中继服务器已部署并运行 (curl /health 返回 ok)
□ 2. PA_RELAY_KEY 已设置为强随机密钥
□ 3. CLI Agent .env 配置完成 (OPENAI_API_KEY, API_BASE_URL, PA_RELAY_URL, PA_RELAY_KEY)
□ 4. CLI Agent 能成功注册 (pa remote-relay --pair 显示配对码)
□ 5. iPhone App 已编译安装到设备
□ 6. iPhone App 输入正确的 Server URL 和 Pair Code 完成配对
□ 7. CLI 终端显示 "Relay connection established"
□ 8. iPhone 发送测试消息，CLI 收到并回复
```

---

*本文档基于 Personal Agent v1.0 源码分析生成。如有疑问请参考 `docs/PERSONAL_AGENT_PLAN.md` 设计文档。*
