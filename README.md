# Personal Agent

> 私人定制的 AI Agent — 跨端远程控制 + 多 LLM 自由切换 + 完全去品牌化的开源实现

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-green)](https://nodejs.org)
[![iOS](https://img.shields.io/badge/iOS-17%2B-blue)](https://developer.apple.com)
[![Zero Anthropic](https://img.shields.io/badge/Anthropic-Free-orange)]()

Personal Agent 是一个**个人使用的 AI Agent 框架**，核心特性：

- **iPhone 远程控制**：在 iPhone App 上发送指令、审批工具权限、接收流式回复
- **多 LLM 自由切换**：OpenAI / Ollama / DeepSeek / 任何 OpenAI 兼容 API
- **完全去品牌化**：不绑定任何云服务商的 OAuth 订阅，可自主部署
- **三端解耦**：CLI / 中继 / iPhone 三个组件可独立运行与替换

---

## 目录

- [架构概览](#架构概览)
- [快速开始](#快速开始)
- [组件说明](#组件说明)
- [环境变量](#环境变量)
- [开发路线图](#开发路线图)
- [文档索引](#文档索引)
- [许可证](#许可证)

---

## 架构概览

```
┌─────────────┐    WebSocket (outbound)    ┌──────────────┐    WebSocket (outbound)    ┌──────────────┐
│   CLI PC    │◄─────────────────────────►│ Relay Server │◄─────────────────────────►│   iPhone    │
│  (Agent)    │                            │  (Node.js)   │                            │  (SwiftUI)   │
│             │                            │  自建部署     │                            │             │
│ LLM 调用:    │                            │              │                            │             │
│ OpenAI /    │                            │              │                            │             │
│ Ollama      │                            │              │                            │             │
└─────────────┘                            └──────────────┘                            └──────────────┘
```

| 组件 | 目录 | 作用 | 技术栈 |
|------|------|------|--------|
| 中继服务器 | `relay/` | 桥接 CLI 与 iPhone 的 WebSocket，路由消息 | Node.js + Express + ws + JWT |
| CLI Agent | `restored-src/` | LLM 调用、工具执行、本地权限拦截 | TypeScript (Node.js ≥ 18) |
| iPhone App | `iphone-app/` | 远程对话、权限审批、会话管理 | SwiftUI + iOS 17+ |
| 共享协议 | `shared-types/` | 三端共用的消息类型与认证协议 | TypeScript |

**安全特性**：
- 预共享密钥 + JWT + 6 位配对码（无第三方 OAuth）
- 设备绑定（JWT 内含 machineId / deviceUUID）
- CLI 与 iPhone 均走 outbound 连接，无需开放入站端口
- 中继不存储任何对话内容（仅在内存中路由）

---

## 快速开始

完整的中继服务器 + CLI + iPhone 部署流程参见 **[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)**。

### 30 秒预览

```bash
# 1. 启动中继服务器（VPS 或本机）
cd relay
PA_RELAY_KEY=my-secret-2026 npm start
# → listening on http://0.0.0.0:7780

# 2. 启动 CLI 并生成配对码
PA_RELAY_URL=http://your-server:7780 \
PA_RELAY_KEY=my-secret-2026 \
OPENAI_API_KEY=sk-xxx \
npx tsx restored-src/src/cli/handlers/remoteRelay.ts --pair
# → Pair Code: 482917 (5 min expiry)

# 3. 在 iPhone App 中输入 Server URL + Pair Code 完成配对
```

### LLM 切换

```bash
# OpenAI
export OPENAI_API_KEY=sk-xxx
export API_BASE_URL=https://api.openai.com/v1

# Ollama（本地模型）
export OPENAI_API_KEY=ollama
export API_BASE_URL=http://localhost:11434/v1

# DeepSeek / 任意 OpenAI 兼容 API
export OPENAI_API_KEY=your-key
export API_BASE_URL=https://api.deepseek.com/v1
```

---

## 组件说明

### `relay/` — 中继服务器

自建轻量级 Node.js 服务，仅依赖 `express` + `ws` + `jsonwebtoken`：

- **HTTP API**：`/api/cli/register`、`/api/iphone/pair`、`/api/pair-code/generate`、`/api/sessions`、`/health`
- **WebSocket Hub**：`/ws?token=<JWT>`，支持 CLI + iPhone 双角色
- **认证**：预共享密钥 → JWT；CLI 通过机器标识，iPhone 通过 6 位配对码
- **Dockerfile**：多阶段构建，直接 `docker build -t pa-relay -f relay/Dockerfile .`

### `restored-src/` — CLI Agent

包含两套并行代码：

- **原始包**（`package/`、`restored-src/src/`）：基于 `claude-code@2.1.88` 的 npm 原始构建产物（含 TypeScript 还原源码），作为 Personal Agent 改造的起点
- **Personal Agent 改造**（`restored-src/src/relay/`、`restored-src/src/cli/handlers/remoteRelay.ts`）：新增的中继连接模块和 `pa remote-relay` 命令

LLM 接入走标准 OpenAI 协议，可在 `.env` 中自由切换 provider。`client.ts` 已移除对原 OAuth 订阅的硬依赖。

### `iphone-app/` — iPhone App

iOS 17+ SwiftUI 原生应用：

- **零第三方 SDK 依赖**（仅 `Foundation` + SwiftUI + `URLSessionWebSocketTask`）
- **4 个 View**：LoginView（配对登录）、ChatView（流式对话）、PermissionView（权限审批弹窗）、SettingsView
- **2 个 Service**：AuthService（JWT 持久化）、RelayWebSocket（自动重连 + 30s 心跳）
- **构建方式**：在 macOS 14+ 上用 Xcode 15 打开 `iphone-app/`，或用 `swift package` 命令构建

### `shared-types/` — 共享协议

三端共用的 TypeScript 类型定义：

- `agentMessage.ts` — 消息联合类型（`AgentMessage`）
- `relayProtocol.ts` — 认证、会话、消息信封协议
- `index.ts` — 便捷构造函数（`makePermissionRequest`、`makeUserInputMessage` 等）

---

## 环境变量

### 中继服务器

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `PA_RELAY_KEY` | ✅ | — | 预共享密钥（CLI 与 iPhone 必须一致） |
| `PA_RELAY_PORT` | ❌ | 7780 | HTTP 监听端口 |
| `PA_RELAY_HOST` | ❌ | 0.0.0.0 | 监听地址 |
| `PA_TOKEN_TTL_SEC` | ❌ | 86400 | JWT 有效期（秒） |
| `PA_HEARTBEAT_TIMEOUT_SEC` | ❌ | 90 | 心跳超时（秒） |
| `PA_PAIR_CODE_TTL_SEC` | ❌ | 300 | 配对码有效期（秒） |

### CLI Agent

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_API_KEY` | ✅ | LLM API Key |
| `API_BASE_URL` | ✅ | LLM API 基地址 |
| `PA_RELAY_URL` | 远程控制时必填 | 中继服务器地址（如 `http://x.x.x.x:7780`） |
| `PA_RELAY_KEY` | 远程控制时必填 | 预共享密钥 |
| `PA_MODEL` | ❌ | 模型名（默认由 provider 决定） |

详细配置见 [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md#8-环境变量完整参考)。

---

## 开发路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 核心解耦：去 OAuth 强依赖、支持 OpenAI API | ✅ 完成 |
| Phase 6 P0 | iPhone 远程控制：三端基础架构 + 配对认证 | ✅ 完成 |
| Phase 6 P1 | 接入 QueryEngine：iPhone 消息注入 Agent 主循环 | 🚧 进行中 |
| Phase 6 P2 | APNs 推送、Xcode 项目生成、Docker 一键部署 | 📋 待开始 |
| Phase 2-5 | FileOrganizer / Monitor / FinanceData / QuantStrategy 工具 | 📋 规划中 |

完整规划见 [docs/PERSONAL_AGENT_PLAN.md](docs/PERSONAL_AGENT_PLAN.md)。

---

## 文档索引

| 文档 | 用途 |
|------|------|
| **[DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)** | 部署、安装、使用完整手册（推荐首读） |
| [PERSONAL_AGENT_PLAN.md](docs/PERSONAL_AGENT_PLAN.md) | 项目设计计划与阶段路线图 |
| [SYSTEM_PROMPT_AUDIT.md](docs/SYSTEM_PROMPT_AUDIT.md) | 系统提示词品牌化清理审计 |
| [relay/README.md](relay/README.md) | 中继服务器专属说明 |
| [iphone-app/README.md](iphone-app/README.md) | iPhone App 构建说明 |

---

## 技术亮点

### 完全去品牌化
- ❌ 无 OAuth / 无 claude.ai 订阅检查 / 无 `anthropic-version` HTTP 头
- ❌ 无 GrowthBook Feature Flags / 无远程管理
- ❌ 无 SDKMessage 类型（自定义 `AgentMessage` 替代）
- ✅ LLM Provider 完全用户自主（OpenAI / Ollama / DeepSeek / 任意兼容 API）

### 三端解耦
- 中继服务器**不感知** CLI 使用的 LLM 类型（消息协议只传递文本和工具调用）
- iPhone App**不直接调用** LLM（始终经由 CLI 转发）
- CLI 端**不绑定**特定中继实现（可换成其他 WebSocket 服务）

### 轻量部署
- 中继服务器内存占用 < 50 MB（单人使用）
- Docker 镜像基于 `node:20-slim`，单层构建
- iPhone App 无第三方 SDK，安装包 < 5 MB

---

## 许可证

本仓库使用 [MIT License](LICENSE)。

---

## 致谢

- Personal Agent 基于 [claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code) 的开源代码进行二次开发
- LLM Provider 接入使用 OpenAI 标准协议
- 移动端使用 Apple SwiftUI 框架
