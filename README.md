# smartagent-code-sourcemap

[![linux.do](https://img.shields.io/badge/linux.do-huo0-blue?logo=linux&logoColor=white)](https://linux.do)

> [!WARNING]
> This repository is **unofficial** and is reconstructed from the public npm package and source map analysis, **for research purposes only**.
> It does **not** represent the original internal development repository structure.
>
> 本仓库为**非官方**整理版，基于公开 npm 发布包与 source map 分析还原，**仅供研究使用**。
> **不代表**官方原始内部开发仓库结构。
> 一切基于L站"飘然与我同"的情报提供

## 概述

本仓库通过 npm 发布包（`@anthropic-ai/smartagent-code`）内附带的 source map（`cli.js.map`）还原的 TypeScript 源码，版本为 `2.1.88`。

## 来源

- npm 包：[@anthropic-ai/smartagent-code](https://www.npmjs.com/package/@anthropic-ai/smartagent-code)
- 还原版本：`2.1.88`
- 还原文件数：**4756 个**（含 1884 个 `.ts`/`.tsx` 源文件）
- 还原方式：提取 `cli.js.map` 中的 `sourcesContent` 字段

## 目录结构

```
restored-src/src/
├── main.tsx              # CLI 入口
├── tools/                # 工具实现（Bash、FileEdit、Grep、MCP 等 30+ 个）
├── commands/             # 命令实现（commit、review、config 等 40+ 个）
├── services/             # API、MCP、分析等服务
├── utils/                # 工具函数（git、model、auth、env 等）
├── context/              # React Context
├── coordinator/          # 多 Agent 协调模式
├── assistant/            # 助手模式（KAIROS）
├── buddy/                # AI 伴侣 UI
├── remote/               # 远程会话
├── plugins/              # 插件系统
├── skills/               # 技能系统
├── voice/                # 语音交互
└── vim/                  # Vim 模式
```

## 声明

- 源码版权归 [hbruce](https://www.anthropic.com) 所有
- 本仓库仅用于技术研究与学习，请勿用于商业用途
- 如有侵权，请联系删除

---

## Personal Agent 自定义项目

本仓库已基于上述还原源码改造为**个人定制化 AI Agent**，服务于：
- 文件整理与自动化
- 系统监控
- 财经信息采集
- 股市量化策略开发
- **iPhone 远程控制**（已实现）

### 核心改造

| 改造项 | 状态 | 文档 |
|--------|------|------|
| 去 OAuth（支持 OpenAI/Ollama API） | ✅ 完成 | [PERSONAL_AGENT_PLAN.md](docs/PERSONAL_AGENT_PLAN.md) |
| 系统提示词去品牌化 | ✅ 完成 | [SYSTEM_PROMPT_AUDIT.md](docs/SYSTEM_PROMPT_AUDIT.md) |
| 文件整理工具 | 🚧 开发中 | PERSONAL_AGENT_PLAN.md §3.1 |
| 系统监控工具 | 🚧 开发中 | PERSONAL_AGENT_PLAN.md §3.2 |
| **iPhone 远程控制** | ✅ **完成** | [IPHONE_REMOTE_INTEGRATION.md](docs/IPHONE_REMOTE_INTEGRATION.md) |

### iPhone 远程控制

**架构**: iPhone App ↔ 自建中继服务器 ↔ Personal Agent CLI

```
iPhone App (SwiftUI)
  ├── 12 个 Swift 文件
  ├── 配对码认证（无 OAuth）
  ├── 流式消息渲染
  ├── 权限审批弹窗
  └── iOS 推送通知

中继服务器 (Node.js)
  ├── 7 个 TypeScript 文件
  ├── HTTP API + WebSocket Hub
  ├── JWT 认证 + 6位配对码
  └── Docker 部署

CLI 端 (Personal Agent)
  ├── 7 个 relay TypeScript 文件
  ├── `pa remote-relay` 命令
  ├── 消息队列注入
  └── 权限桥接
```

**快速开始**:

```bash
# 1. 启动中继服务器
cd relay
PA_RELAY_KEY=your-secret npm start

# 2. PC 启动 CLI + 生成配对码
PA_RELAY_URL=http://your-server:7780 PA_RELAY_KEY=your-secret \
  pa remote-relay --pair

# 3. iPhone App 中输入配对码
# (需在 macOS 上用 Xcode 打开 iphone-app/Package.swift 构建)
```

**端到端测试**:
```bash
cd relay
PA_RELAY_KEY=e2e-test-key npm start &
npm run test:e2e
# 预期: 15 tests passed
```

### 目录新增结构

```
claude-code-sourcemap/
├── relay/                              # 中继服务器
│   ├── src/                            # 6 个 TS 文件
│   ├── test/e2e.ts                     # 端到端测试
│   ├── Dockerfile
│   └── .env.example
├── shared-types/                       # 共享协议
│   ├── src/agentMessage.ts
│   ├── src/relayProtocol.ts
│   └── src/index.ts
├── restored-src/src/relay/             # CLI 端中继连接
│   ├── relayConnector.ts               # WS 客户端
│   ├── relaySessionManager.ts          # 整合层
│   ├── relayPermissionBridge.ts        # 权限桥
│   ├── relayCanUseTool.ts              # canUseTool 包装
│   ├── relayAuth.ts                    # HTTP API
│   ├── relayConfig.ts                  # 环境变量
│   └── index.ts
├── restored-src/src/cli/handlers/
│   └── remoteRelay.ts                  # `pa remote-relay` 命令
├── iphone-app/                         # iPhone SwiftUI App
│   ├── Package.swift                   # SwiftPM 配置
│   ├── Info.plist
│   ├── PersonalAgentRemote/            # 12 个 Swift 文件
│   │   ├── PersonalAgentApp.swift
│   │   ├── Models/AgentMessage.swift
│   │   ├── Services/
│   │   │   ├── AuthService.swift
│   │   │   ├── NotificationService.swift
│   │   │   └── RelayWebSocket.swift
│   │   ├── ViewModels/ChatViewModel.swift
│   │   └── Views/
│   │       ├── ContentView.swift
│   │       ├── LoginView.swift
│   │       ├── ChatView.swift
│   │       ├── PermissionView.swift
│   │       ├── SessionListView.swift
│   │       └── SettingsView.swift
│   └── README.md
├── docs/
│   ├── PERSONAL_AGENT_PLAN.md          # 主计划文档
│   ├── SYSTEM_PROMPT_AUDIT.md          # 系统提示词审核
│   └── IPHONE_REMOTE_INTEGRATION.md    # iPhone 远程控制完整集成指南
└── docker-compose.yml                  # 一键部署中继服务器
```
