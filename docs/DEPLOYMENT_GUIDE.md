# Personal Agent — 使用手册

> 部署、安装、配置与日常使用完整指南

---

## 目录

1. [快速概览](#1-快速概览)
2. [前置要求](#2-前置要求)
3. [部署中继服务器](#3-部署中继服务器)
4. [配置 CLI Agent](#4-配置-cli-agent)
5. [构建 iPhone App](#5-构建-iphone-app)
6. [首次配对](#6-首次配对)
7. [日常使用](#7-日常使用)
8. [进阶：切换 LLM](#8-进阶切换-llm)
9. [故障排查](#9-故障排查)

---

## 1. 快速概览

Personal Agent 由三个组件组成：

```
┌─────────────┐    WebSocket (outbound)    ┌──────────────┐    WebSocket (outbound)    ┌──────────────┐
│   CLI PC    │◄─────────────────────────►│ Relay Server │◄─────────────────────────►│   iPhone    │
│  (Agent)    │                            │  (Node.js)   │                            │  (SwiftUI)   │
│             │                            │  自建部署     │                            │             │
│ LLM:        │                            │              │                            │             │
│ OpenAI /    │                            │              │                            │             │
│ Ollama      │                            │              │                            │             │
└─────────────┘                            └──────────────┘                            └──────────────┘
```

| 组件 | 目录 | 角色 | 你需要做的 |
|------|------|------|-----------|
| **中继服务器** | `relay/` | 桥接 WebSocket，转发消息 | 部署到 VPS 或本机 |
| **CLI Agent** | `restored-src/` | 调用 LLM，执行工具 | 在 PC 上配置 .env 并运行 |
| **iPhone App** | `iphone-app/` | 远程交互界面 | 在 Mac 上 Xcode 编译后安装到 iPhone |

---

## 2. 前置要求

### 2.1 中继服务器

| 依赖 | 最低版本 |
|------|----------|
| Node.js | 18.0+（推荐 20 LTS） |
| npm | 10+（随 Node 安装） |
| Docker（可选） | 24+（仅 Docker 部署需要） |

### 2.2 CLI Agent（PC）

| 依赖 | 最低版本 |
|------|----------|
| Node.js | 18.0+（推荐 20 LTS） |
| LLM API Key | OpenAI / Ollama / DeepSeek / 任何 OpenAI 兼容 API |

### 2.3 iPhone App

| 依赖 | 最低版本 |
|------|----------|
| macOS | 14.0+（仅构建时需要） |
| Xcode | 15.0+（仅构建时需要） |
| iOS | 17.0+ |
| Apple ID | 任意（免费账号可侧载 7 天） |

---

## 3. 部署中继服务器

中继服务器是 CLI 与 iPhone 通信的桥梁。**推荐部署到有公网 IP 的 VPS**（或局域网内能互相访问的机器）。

### 方式 A：直接运行（开发/测试）

```bash
cd relay
npm install
PA_RELAY_KEY=my-strong-secret-2026 npm start
```

成功启动后控制台显示：

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
# 在项目根目录执行
docker build -t pa-relay -f relay/Dockerfile .
docker run -d --name pa-relay \
  -p 7780:7780 \
  -e PA_RELAY_KEY=my-strong-secret-2026 \
  --restart unless-stopped \
  pa-relay
```

### 方式 C：Docker Compose

仓库根目录已有 `docker-compose.yml`，直接：

```bash
PA_RELAY_KEY=my-strong-secret-2026 docker compose up -d
```

### 验证

```bash
curl http://<服务器IP>:7780/health
# 预期: {"status":"ok","connections":0,"sessions":0,"uptime":...}
```

### 环境变量（中继）

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `PA_RELAY_KEY` | ✅ | — | 预共享密钥（CLI 和 iPhone 必须相同） |
| `PA_RELAY_PORT` | ❌ | 7780 | HTTP 监听端口 |
| `PA_RELAY_HOST` | ❌ | 0.0.0.0 | 监听地址 |
| `PA_TOKEN_TTL_SEC` | ❌ | 86400 | JWT 有效期（秒） |
| `PA_HEARTBEAT_TIMEOUT_SEC` | ❌ | 90 | 心跳超时（秒） |
| `PA_PAIR_CODE_TTL_SEC` | ❌ | 300 | 配对码有效期（秒） |

> **安全提示**：生产环境务必使用强随机密钥，例如 `openssl rand -hex 32`。如需公网 HTTPS，建议配合 Nginx + Let's Encrypt 证书。

---

## 4. 配置 CLI Agent

### 4.1 准备 .env

在项目根目录：

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
# === LLM Provider（必填一项）===

# 方式 A: OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
API_BASE_URL=https://api.openai.com/v1

# 方式 B: Ollama 本地模型
# OPENAI_API_KEY=ollama
# API_BASE_URL=http://localhost:11434/v1

# 方式 C: DeepSeek
# OPENAI_API_KEY=sk-your-deepseek-key
# API_BASE_URL=https://api.deepseek.com/v1

# === 中继服务器（远程控制必填）===
PA_RELAY_URL=http://your-relay-server:7780
PA_RELAY_KEY=my-strong-secret-2026
```

### 4.2 安装依赖

```bash
cd restored-src
npm install
```

### 4.3 本地运行（不使用 iPhone）

直接使用 CLI 在终端对话：

```bash
npx tsx src/main.tsx
# 或在改造后使用 npx tsx src/cli/handlers/remoteRelay.ts 启动远程模式
```

### 4.4 环境变量（CLI）

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_API_KEY` | ✅ | LLM API Key |
| `API_BASE_URL` | ✅ | LLM API 基地址 |
| `PA_RELAY_URL` | 远程控制时必填 | 中继服务器地址 |
| `PA_RELAY_KEY` | 远程控制时必填 | 与中继服务器相同的密钥 |
| `PA_MODEL` | ❌ | 模型名（默认由 provider 决定） |

---

## 5. 构建 iPhone App

### 5.1 前置准备

- Mac（macOS 14+）已安装 Xcode 15+
- Apple ID（免费即可侧载）
- iPhone（iOS 17+）
- 数据线

### 5.2 在 Xcode 中打开

1. Finder 打开 `iphone-app/` 目录
2. 如果已有 `.xcodeproj`，双击打开
3. 如果是首次构建，需要创建 Xcode 项目：
   - `File → New → Project → iOS → App`
   - Product Name: `PersonalAgentRemote`
   - Interface: SwiftUI，Language: Swift
   - 保存到 `iphone-app/`
4. 将 `iphone-app/PersonalAgentRemote/` 下的所有 Swift 文件拖入项目

### 5.3 配置签名

1. Xcode 左侧选中项目 → **Signing & Capabilities**
2. Team: 选择你的 Apple ID
3. Bundle Identifier: `com.<你的名字>.PersonalAgentRemote`

### 5.4 编译安装

1. 用数据线连接 iPhone 到 Mac
2. iPhone 上: `设置 → 隐私与安全 → 开发者模式 → 打开`
3. Xcode 顶部选择你的 iPhone 作为目标设备
4. 点击 **Run**（`Cmd+R`）

### 5.5 首次信任

iPhone 上安装后可能提示"不受信任的开发者"：

```
设置 → 通用 → VPN与设备管理 → 找到你的 Apple ID → 点击"信任"
```

---

## 6. 首次配对

### 6.1 启动中继服务器

（按 §3 启动，保持运行）

### 6.2 PC 端生成配对码

```powershell
# Windows PowerShell
$env:PA_RELAY_URL="http://your-relay-server:7780"
$env:PA_RELAY_KEY="my-strong-secret-2026"
$env:OPENAI_API_KEY="sk-xxx"
$env:API_BASE_URL="https://api.openai.com/v1"

cd restored-src
npx tsx src/cli/handlers/remoteRelay.ts --pair
```

终端显示类似：

```
🔌 Connecting to relay server: http://your-relay-server:7780
✅ Registered. Client ID: cli-DESKTOP-XXX

📱 iPhone Pairing Code:
   ┌─────────────┐
   │  482917     │
   └─────────────┘

   Open your iPhone App and enter this code to pair.
   The code expires in 5 minutes.
```

**记下这个 6 位配对码**（5 分钟内有效）。

### 6.3 iPhone 配对

1. 打开 iPhone 上的 **PersonalAgentRemote** App
2. 在配对界面输入：
   - **Server URL**: `http://your-relay-server:7780`
   - **Pair Code**: `482917`（上一步的 6 位码）
   - **Device Name**: 自动填充，可修改
3. 点击 **"Pair with CLI"**
4. 配对成功后自动进入对话界面

### 6.4 验证

PC 终端显示：

```
🔗 Relay connection established. iPhone can now connect.
🚀 Personal Agent relay is running.
```

打开 iPhone App → 应该看到"已连接"状态。

---

## 7. 日常使用

### 7.1 启动顺序

每次使用：

```bash
# 1. 中继服务器（已部署到 VPS 上保持运行，可跳过）

# 2. PC 端启动 CLI（不需要 --pair）
cd /path/to/personal-agent/restored-src
$env:PA_RELAY_URL="http://your-relay-server:7780"
$env:PA_RELAY_KEY="my-strong-secret-2026"
$env:OPENAI_API_KEY="sk-xxx"
npx tsx src/cli/handlers/remoteRelay.ts
```

打开 iPhone App → 自动连接 → 发消息。

### 7.2 iPhone App 功能

| 功能 | 操作 |
|------|------|
| 发送消息 | 在 ChatView 输入文字 → 发送 |
| 接收流式回复 | 自动显示（实时渲染） |
| 审批工具权限 | Agent 执行危险操作时弹窗 → 允许/拒绝 |
| 中断 Agent | 点击"中断"按钮 |
| 查看活跃会话 | 进入 SessionListView |
| 修改设置 | SettingsView 修改中继地址、清除登录 |

### 7.3 权限审批示例

当 Agent 要执行 `Bash("rm -rf /tmp/old-files")` 时，iPhone 弹出：

```
┌─────────────────────────────┐
│ 🔐 Permission Request        │
│                              │
│ Tool: Bash                   │
│ Input: rm -rf /tmp/old-files │
│                              │
│  [ Allow ]    [ Deny ]       │
└─────────────────────────────┘
```

- **Allow**: Agent 继续执行
- **Deny**: Agent 收到拒绝并中止
- **超时 2 分钟未响应**: 自动 Deny（安全兜底）

---

## 8. 进阶：切换 LLM

修改 PC 端 `.env` 即可切换 LLM，**无需重启中继服务器**：

### 切换到 OpenAI

```bash
OPENAI_API_KEY=sk-xxx
API_BASE_URL=https://api.openai.com/v1
PA_MODEL=gpt-4o
```

### 切换到 Ollama（本地模型）

```bash
# 先启动 Ollama: ollama serve
OPENAI_API_KEY=ollama
API_BASE_URL=http://localhost:11434/v1
PA_MODEL=qwen2.5:14b
```

### 切换到 DeepSeek

```bash
OPENAI_API_KEY=sk-your-deepseek-key
API_BASE_URL=https://api.deepseek.com/v1
PA_MODEL=deepseek-chat
```

### 切换到任意 OpenAI 兼容 API（vLLM、LM Studio、Azure OpenAI 等）

只需保证 `API_BASE_URL` 指向兼容 `/v1/chat/completions` 端点即可。

---

## 9. 故障排查

### 9.1 中继服务器

| 症状 | 排查 |
|------|------|
| `Missing required env: PA_RELAY_KEY` | 设置 `PA_RELAY_KEY` 环境变量 |
| iPhone 无法连接 | 防火墙放行 7780；`PA_RELAY_HOST=0.0.0.0` |
| WebSocket 连接被拒 | JWT 过期（默认 24h），CLI 重新启动获取新 token |
| 频繁断连 | `PA_HEARTBEAT_TIMEOUT_SEC` 过短（CLI 默认 30s 心跳） |

### 9.2 CLI Agent

| 症状 | 排查 |
|------|------|
| `Relay configuration not found` | 设置 `PA_RELAY_URL` 和 `PA_RELAY_KEY` |
| `Failed to register with relay server` | 中继未运行 / 地址错 / 密钥不一致 |
| LLM 调用失败 | `OPENAI_API_KEY` / `API_BASE_URL` 配置错误 |
| `tsx` 命令不存在 | `npm install -g tsx` 或使用 `npx tsx` |

### 9.3 iPhone App

| 症状 | 排查 |
|------|------|
| 配对失败 "Invalid pair code" | 配对码已过期（5 分钟），CLI 重新 `--pair` |
| 无法连接服务器 | URL 格式（含 `http://` 和端口号）；中继是否启动 |
| App 闪退 | 确认 iOS 17+；查看 Xcode Console |
| "不受信任的开发者" | 设置 → 通用 → VPN与设备管理 → 信任证书 |

### 9.4 网络连通性测试

```bash
# 中继健康
curl http://your-relay-server:7780/health

# Docker 日志
docker logs pa-relay -f --tail 50

# 端到端测试
cd relay
PA_RELAY_KEY=test-key npm start &
PA_RELAY_KEY=test-key npm run test:e2e
```

---

## 附：检查清单

首次部署：

```
□ 1. 中继服务器部署并运行（curl /health 返回 ok）
□ 2. PA_RELAY_KEY 已设置为强随机密钥
□ 3. CLI .env 配置完成（OPENAI_API_KEY, API_BASE_URL, PA_RELAY_URL, PA_RELAY_KEY）
□ 4. CLI 端能成功注册（看到 "Registered. Client ID: ..."）
□ 5. iPhone App 已通过 Xcode 编译安装
□ 6. iPhone App 输入正确 Server URL + Pair Code 完成配对
□ 7. CLI 终端显示 "Relay connection established"
□ 8. iPhone 发送测试消息，CLI 收到并回复
```

日常使用：

```
□ 1. 中继服务器保持运行
□ 2. PC 上启动 CLI（npx tsx ...remoteRelay.ts）
□ 3. iPhone App 打开即可使用
```

---

*本文档对应 Personal Agent v1.0。详细架构与开发计划见 [README.md](../README.md)。*
