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
│ Anthropic / │                            │              │                            │             │
│ 火山引擎 /   │                            │              │                            │             │
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
| LLM API Key | Anthropic / OpenAI / 火山引擎 / Ollama / DeepSeek / 任何 OpenAI 兼容 API |

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

> **Relay 模式（`relay-cli.ts`）额外支持 Anthropic 原生 API 和火山引擎方舟**，通过 `LLM_PROVIDER` 环境变量切换，详见 [§8. 进阶：切换 LLM](#8-进阶切换-llm)。

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

**Relay 模式（`relay-cli.ts`）额外环境变量：**

| 变量 | 必填 | 说明 |
|------|------|------|
| `LLM_PROVIDER` | ❌ | LLM 提供商：`anthropic`（默认）或 `openai` |
| `ANTHROPIC_API_KEY` | Anthropic 模式必填 | Anthropic API Key |
| `ANTHROPIC_MODEL` | ❌ | Anthropic 模型名（默认 `claude-sonnet-4-20250514`） |
| `ANTHROPIC_BASE_URL` | ❌ | Anthropic 自定义 Base URL（用于代理） |
| `OPENAI_API_KEY` | OpenAI 模式必填 | OpenAI 兼容 API Key |
| `OPENAI_BASE_URL` | OpenAI 模式必填 | API Base URL（如火山引擎 `https://ark.cn-beijing.volces.com/api/v3`） |
| `OPENAI_MODEL` | ❌ | 模型名（如 `doubao-pro-32k`、`deepseek-chat`） |

---

## 5. 构建 iPhone App

### 5.1 前置准备

- Mac（macOS 14+）已安装 Xcode 15+
- Apple ID（免费即可侧载）
- iPhone（iOS 17+）
- 数据线

### 5.2 在 Xcode 中打开

1. 如果已有 `.xcodeproj`，双击打开即可
2. 如果是首次构建（仓库不含 `.xcodeproj`），需要用 Xcode 创建项目：
   - `File → New → Project → iOS → App`
   - Product Name: `PersonalAgentRemote`
   - Interface: SwiftUI，Language: Swift
   - **保存到项目根目录**（不是 `iphone-app/`，否则会与源码文件夹同名冲突）
3. 将 `iphone-app/PersonalAgentRemote/` 下的所有 Swift 文件拖入项目

> 📖 **首次构建详细操作指南**（含目录结构图、模板文件清理、ATS 配置、签名、FAQ）见 [§5.6](#56-macbook-编译-iphone-app-到真机详细步骤)。

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

### 5.6 MacBook 编译 iPhone App 到真机（详细步骤）

> 本节是从零开始在 MacBook 上创建 Xcode 项目、挂载源码、签名并装机到 iPhone 真机的**完整手把手指南**。如果你已熟悉 Xcode，可直接参考 §5.1–5.5 的精简步骤。

#### 5.6.1 前置检查

| 项目 | 要求 |
|------|------|
| MacBook | macOS 14.0+（Sonoma 或更高） |
| Xcode | 15.0+（从 Mac App Store 免费安装） |
| iPhone | iOS 17.0+ |
| 数据线 | 原装或 MFi 认证 Lightning / USB-C 线 |
| Apple ID | 任意免费账号即可（免费账号签名有效期 7 天，到期重新编译即可） |

确认 Xcode 已安装命令行工具：

```bash
xcode-select -p
# 预期输出: /Applications/Xcode.app/Contents/Developer
```

如未安装：`xcode-select --install`

#### 5.6.2 把项目同步到 MacBook

**方式 A：Git Clone（推荐）**

```bash
cd ~/Documents
git clone <你的仓库地址> aicodingagent
cd aicodingagent
```

**方式 B：U 盘 / 网盘拷贝**

将 Windows 上的整个项目文件夹复制到 MacBook，假设放到 `~/Documents/aicodingagent/`。

同步后确认目录结构：

```
~/Documents/aicodingagent/
├── iphone-app/
│   ├── Info.plist
│   ├── Package.swift
│   ├── README.md
│   └── PersonalAgentRemote/          ← 仓库源码（含 @main 入口）
│       ├── PersonalAgentApp.swift
│       ├── Assets.xcassets/
│       ├── Models/
│       ├── Services/
│       ├── ViewModels/
│       └── Views/
├── relay/
├── restored-src/
├── docker-compose.yml
└── docs/
```

> ⚠️ 此时**没有** `.xcodeproj` 文件，需要用 Xcode 从零创建。SPM（Package.swift）不支持 iOS 真机签名，必须走 Xcode GUI 创建 iOS App 项目。

#### 5.6.3 从零创建 Xcode 项目

1. 打开 **Xcode** → 菜单栏 **File → New → Project**
2. 选择 **iOS → App** → 点击 **Next**
3. 填写项目信息：

   | 字段 | 填写值 |
   |------|--------|
   | Product Name | `PersonalAgentRemote`（**首字母大写，严格一致**） |
   | Team | 暂时选 None，稍后配置 |
   | Organization Identifier | `com.你的名字`（如 `com.bruce`） |
   | Interface | `SwiftUI` |
   | Language | `Swift` |
   | Storage | `None`（不使用 Core Data） |
   | Include Tests | 不勾选 |

4. 点击 **Next** → 选择保存路径
5. **关键**：保存到 `~/Documents/aicodingagent/`（**选项目根目录这一层，不要选 `iphone-app/`！**）
6. 点击 **Create**

> ⚠️ **为什么存到项目根目录而不是 `iphone-app/`？**
> Xcode 会在你选的目录下自动创建一个与 Product Name 同名的文件夹（`PersonalAgentRemote/`）。如果存到 `iphone-app/` 下，会与仓库已有的 `iphone-app/PersonalAgentRemote/` 源码文件夹冲突，Xcode 会提示"folder already exists, move to trash?"——**千万不要点 Move to Trash**，那会删掉你的源码。存到项目根目录 `aicodingagent/` 下则不会冲突。

创建后的目录结构：

```
~/Documents/aicodingagent/
├── iphone-app/                         ← 仓库代码（未动）
│   ├── Info.plist
│   ├── Package.swift
│   └── PersonalAgentRemote/            ← 仓库源码（未动）
├── PersonalAgentRemote.xcodeproj/      ← 🆕 Xcode 项目文件
├── PersonalAgentRemote/                ← 🆕 Xcode 自动建的空壳
│   ├── PersonalAgentRemoteApp.swift    ← ❌ 模板文件（待删）
│   ├── ContentView.swift               ← ❌ 模板文件（待删）
│   └── Assets.xcassets/                ← ❌ 模板文件（待删）
├── relay/
└── ...
```

#### 5.6.4 删除模板文件 + 挂载仓库源码

**第 1 步：删除 Xcode 自动生成的模板文件**

在 Xcode 左侧导航器（Project Navigator）中，右键点击以下 3 个文件 → 选择 **Delete** → 在弹窗中点击 **Move to Trash**：

- `PersonalAgentRemoteApp.swift`（模板入口，与仓库的 `PersonalAgentApp.swift` 冲突）
- `ContentView.swift`（模板视图）
- `Assets.xcassets`（模板资源）

> ⚠️ 这一步**必须做**。如果不删，项目里会有两个 `@main` 入口，编译报错。

**第 2 步：将仓库源码拖入项目**

1. 打开 **Finder**，导航到 `~/Documents/aicodingagent/iphone-app/PersonalAgentRemote/`
2. 选中以下 6 个文件/文件夹（按 `Cmd+A` 全选即可）：
   - `PersonalAgentApp.swift`
   - `Assets.xcassets/`
   - `Models/`
   - `Services/`
   - `ViewModels/`
   - `Views/`
3. **拖入** Xcode 左侧导航器的 `PersonalAgentRemote` group（黄色文件夹图标）下
4. 弹窗中配置：

   | 选项 | 设置 |
   |------|------|
   | Copy items if needed | ✅ 勾选（把文件复制到项目目录） |
   | Added folders | 选择 **Create groups**（不是 Create folder references） |
   | Add to targets | ✅ 勾选 `PersonalAgentRemote` |

5. 点击 **Finish**

**第 3 步：验证**

Xcode 左侧导航器中应能看到：

```
PersonalAgentRemote
├── PersonalAgentApp.swift    ← 带 @main 标记 ✅
├── Assets.xcassets
├── Models
│   └── AgentMessage.swift
├── Services
│   ├── AuthService.swift
│   ├── NotificationService.swift
│   └── RelayWebSocket.swift
├── ViewModels
│   └── ChatViewModel.swift
└── Views
    ├── ContentView.swift
    ├── LoginView.swift
    ├── ChatView.swift
    ├── PermissionView.swift
    ├── SessionListView.swift
    └── SettingsView.swift
```

#### 5.6.5 配置 ATS 与后台模式

仓库的 `iphone-app/Info.plist` 已预配置好 ATS（允许 HTTP 连接）和后台推送模式。你有两种方式将这些配置应用到 Xcode 项目：

**方案 A（推荐）：在 Xcode 项目 Info 页手动注入**

1. Xcode 左侧点击项目名 `PersonalAgentRemote` → 中间面板选 **TARGETS → PersonalAgentRemote → Info**
2. 在 **Custom iOS Target Properties** 表格中点击 `+` 添加以下键：

   | Key | Type | Value |
   |-----|------|-------|
   | App Transport Security Settings | Dictionary | （展开后添加子项） |
   | └ Allow Arbitrary Loads | Boolean | `YES` |
   | └ Allows Local Networking | Boolean | `YES` |

3. 切换到 **Signing & Capabilities** 标签 → 点击左上角 **+ Capability**
4. 搜索 **Background Modes** → 双击添加
5. 勾选 **Remote notifications**

**方案 B（保真）：直接引用仓库的 Info.plist**

1. Xcode 左侧点击项目名 → **TARGETS → PersonalAgentRemote → Info**
2. 找到 **Info.plist File**（或 Build Settings → Packaging → Info.plist File）
3. 设置为 `iphone-app/Info.plist` 的路径
4. 确认 **Background Modes** capability 中勾选了 **Remote notifications**

> 两种方案效果相同，选一种即可。方案 A 更常见，方案 B 保证与仓库配置完全一致。

#### 5.6.6 配置签名

1. Xcode 左侧点击项目名 `PersonalAgentRemote` → **TARGETS → PersonalAgentRemote → Signing & Capabilities**
2. 勾选 ✅ **Automatically manage signing**
3. **Team** 下拉 → 点击 **Add Account...** → 登录你的 Apple ID（免费账号即可）
4. 登录后回到 Xcode，Team 下拉选择你的 Apple ID（Personal Team）
5. **Bundle Identifier** 改为全局唯一值，如 `com.你的名字.PersonalAgentRemote`

> ⚠️ Bundle ID 必须全球唯一。如果提示 "identifier already in use"，换一个前缀再试。

#### 5.6.7 真机准备

1. 用数据线将 iPhone 连接到 MacBook
2. iPhone 弹窗 → 点击 **信任** → 输入锁屏密码
3. iPhone → **设置 → 隐私与安全 → 开发者模式**
4. 打开 **开发者模式** 开关 → 弹窗确认 → iPhone 自动重启
5. 重启后回到 Xcode，顶部设备选择器（左上角播放按钮右侧）→ 选择你的 **iPhone 真机**

> 如果看不到 iPhone：Xcode 菜单 → **Window → Devices and Simulators** → 确认设备已列出且状态为 connected。

#### 5.6.8 编译装机

1. Xcode 顶部确认选中的是你的 iPhone 真机（不是模拟器）
2. 点击 **Run** 按钮（或 `Cmd + R`）
3. 首次编译会自动：
   - 向 Apple 注册你的设备 UDID（免费账号每季度限 3 台设备）
   - 生成签名证书和 Provisioning Profile
   - 编译并安装到 iPhone

4. 编译成功后 Xcode 底部状态栏显示 `Running PersonalAgentRemote on <你的iPhone>`

#### 5.6.9 首次信任 + 7 天续签

**首次信任开发者证书：**

iPhone 上首次打开 App 可能闪退或提示"不受信任的开发者"：

```
iPhone → 设置 → 通用 → VPN与设备管理 → 找到你的 Apple ID → 点击"信任"
```

信任后重新打开 App 即可正常使用。

**7 天续签（免费账号限制）：**

免费 Apple ID 签名的 App 有效期仅 **7 天**，过期后 App 打不开。续签方法：

1. iPhone 连上 MacBook
2. Xcode 打开项目 → `Cmd + R` 重新编译安装
3. 签名自动刷新，又能用 7 天

> 💡 如果觉得 7 天太短，可以花 $99/年注册 Apple Developer Program，签名有效期延长至 1 年。

#### 5.6.10 FAQ

| 问题 | 解决方案 |
|------|----------|
| **"Failed to register device"** | 免费账号每季度限注册 3 台设备。换一个 Apple ID 或等待下季度配额重置 |
| **"No signing certificate"** | Xcode → Settings → Accounts → 重新登录 Apple ID；检查 Mac 系统时间是否正确 |
| **"Bundle identifier already in use"** | Bundle ID 不唯一，改为 `com.你的名字.xxx` 换一个前缀 |
| **App 装上后闪退** | 确认 iOS 17+；Xcode → Window → Devices and Simulators → 选设备 → View Device Logs 查看崩溃日志 |
| **HTTP 请求被拦截** | 确认 ATS 配置中 `NSAllowsArbitraryLoads = YES` 已注入（见 §5.6.5） |
| **"folder already exists, move to trash?"** | 创建项目时选错了保存路径。点 Cancel，改为存到项目根目录（不是 `iphone-app/`） |
| **编译报 "duplicate @main"** | 忘了删模板文件。回到 §5.6.4 第 1 步删除 `PersonalAgentRemoteApp.swift` |
| **Xcode 看不到 iPhone** | 数据线问题 / iPhone 未信任 Mac / 未开启开发者模式。逐项检查 §5.6.7 |
| **添加 Apple ID 报 AKAuthenticationError -7045** | 认证服务器通信失败，多由网络/代理引起。详见 §5.6.11 |

#### 5.6.11 添加 Apple ID 报错排查（AKAuthenticationError -7045 等）

Xcode 在 `Settings → Accounts → +` 添加 Apple ID 时报 `(AKAuthenticationError error -7045.)`，表示 Xcode 与 Apple 认证服务器通信失败，**不是账号密码本身的问题**。按以下顺序排查：

**1. 网络与代理（最常见原因）**

| 你的情况 | 操作 |
|----------|------|
| 开着 Charles / 青花瓷 / Surge / ClashX 等抓包代理 | **全部退出**，它们会拦截 Apple 的 SSL 证书导致认证失败 |
| 国内网络无法直连 Apple 服务器 | 开启 VPN/代理的**全局模式**后重试 |
| DNS 污染 | 系统设置 → 网络 → Wi-Fi → 详细信息 → DNS → 添加 `8.8.8.8`、`114.114.114.114` |

**2. 清理失败的账号记录**

1. Xcode → **Settings → Accounts**
2. 列表里如有刚才添加失败的账号（通常显示红色错误），选中后点下方 **"-"** 删除
3. 重新点 **"+"** 添加 Apple ID

**3. 清理 Keychain 旧凭据**

1. `Cmd + Space` 搜索并打开 **钥匙串访问**（Keychain Access）
2. 左侧选择 **"登录"** 钥匙串
3. 上方标签选 **"所有项目"**，搜索框输入 `apple`
4. 找到与 Apple ID / developer / Xcode 相关的旧条目 → 右键 → **删除**（需输入 Mac 登录密码确认）
5. 重启 Xcode 后重新添加账号

**4. 校准系统时间**

SSL 证书验证依赖准确时间，时间偏差会导致认证失败：

- 系统设置 → 通用 → 日期与时间 → 开启 **"自动设置日期与时间"**
- 时区选 **"自动"**

**5. 确认 Apple ID 双重认证**

- 访问 [appleid.apple.com](https://appleid.apple.com) → 登录 → **安全性** → 确认 **"双重认证"** 已开启
- 登录 Xcode 时确保能收到验证码（短信或受信任设备）

**6. 重启**

关闭 Xcode → 退出所有代理软件 → **重启 Mac** → 重新打开 Xcode 添加账号

> 💡 若以上均无效，尝试换一个 Apple ID 添加；或等几小时后再试（Apple 认证服务偶尔波动）。

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

> **Relay 模式**（`relay-cli.ts`）用户请改用以下环境变量并运行 `bun run relay:pair`：
> ```powershell
> $env:LLM_PROVIDER="anthropic"  # 或 "openai"
> $env:ANTHROPIC_API_KEY="sk-ant-xxx"
> # OpenAI 兼容模式: $env:OPENAI_API_KEY / $env:OPENAI_BASE_URL / $env:OPENAI_MODEL
> cd restored-src
> bun run relay:pair
> ```
> 详见 [§8.2 Relay 模式 LLM 配置](#82-relay-模式relay-clits)。

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

> **Relay 模式**（`relay-cli.ts`）用户：
> ```bash
> cd restored-src
> bun run relay
> ```
> LLM 配置见 [§8.2](#82-relay-模式relay-clits)。

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

### 8.1 主 CLI 模式（`main.tsx` / `remoteRelay.ts`）

修改 PC 端 `.env` 即可切换 LLM，**无需重启中继服务器**：

#### 切换到 OpenAI

```bash
OPENAI_API_KEY=sk-xxx
API_BASE_URL=https://api.openai.com/v1
PA_MODEL=gpt-4o
```

#### 切换到 Ollama（本地模型）

```bash
# 先启动 Ollama: ollama serve
OPENAI_API_KEY=ollama
API_BASE_URL=http://localhost:11434/v1
PA_MODEL=qwen2.5:14b
```

#### 切换到 DeepSeek

```bash
OPENAI_API_KEY=sk-your-deepseek-key
API_BASE_URL=https://api.deepseek.com/v1
PA_MODEL=deepseek-chat
```

#### 切换到任意 OpenAI 兼容 API（vLLM、LM Studio、Azure OpenAI 等）

只需保证 `API_BASE_URL` 指向兼容 `/v1/chat/completions` 端点即可。

### 8.2 Relay 模式（`relay-cli.ts`）

Relay 模式通过 `LLM_PROVIDER` 环境变量切换 LLM 后端，支持 **Anthropic 原生 API** 和 **任何 OpenAI 兼容 API**（火山引擎方舟、DeepSeek、通义千问等）。

内部实现了一个统一的 LLM Provider 抽象层（`src/llm/provider.ts`），自动完成 Anthropic ↔ OpenAI 格式转换：

- 工具定义：`input_schema` ↔ `function.parameters`
- 消息历史：`tool_use` block ↔ `tool_calls`，`tool_result` block ↔ `role: 'tool'`
- 停止原因：`end_turn` ↔ `stop`，`tool_use` ↔ `tool_calls`

#### 方式 A：Anthropic 原生 API（默认）

```bash
# .env 或环境变量
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key
ANTHROPIC_MODEL=claude-sonnet-4-20250514   # 可选，默认即此值
# ANTHROPIC_BASE_URL=https://your-proxy.example.com  # 可选，用于代理
```

启动：

```bash
cd restored-src
bun run relay
# 或配对模式
bun run relay:pair
```

#### 方式 B：火山引擎方舟（Doubao）

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your-volcengine-api-key
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
OPENAI_MODEL=doubao-pro-32k
```

#### 方式 C：DeepSeek

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-deepseek-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

#### 方式 D：通义千问（阿里云百炼）

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-dashscope-key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-max
```

#### 方式 E：Ollama 本地模型

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=qwen2.5:14b
```

#### Windows PowerShell 完整启动示例（火山引擎）

```powershell
$env:LLM_PROVIDER="openai"
$env:OPENAI_API_KEY="your-volcengine-key"
$env:OPENAI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
$env:OPENAI_MODEL="doubao-pro-32k"
$env:PA_RELAY_URL="http://your-relay-server:7780"
$env:PA_RELAY_KEY="my-strong-secret-2026"

cd restored-src
bun run relay
```

#### Linux/macOS 完整启动示例（火山引擎）

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=your-volcengine-key
export OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
export OPENAI_MODEL=doubao-pro-32k
export PA_RELAY_URL=http://your-relay-server:7780
export PA_RELAY_KEY=my-strong-secret-2026

cd restored-src
bun run relay
```

> **提示**：切换 LLM 后无需修改 iPhone App 或中继服务器，只需重启 CLI 即可生效。启动时控制台会打印当前 provider 和模型信息：
> ```
> [LLM] Provider: OpenAI-compatible, Base URL: https://ark.cn-beijing.volces.com/api/v3, Model: doubao-pro-32k
> ```

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
| `ANTHROPIC_API_KEY environment variable not set` | Relay 模式未设 Anthropic Key，或设置 `LLM_PROVIDER=openai` 切换到 OpenAI 兼容模式 |
| `OPENAI_API_KEY (or LLM_API_KEY) environment variable not set` | Relay 模式 `LLM_PROVIDER=openai` 但未设 API Key |
| `OPENAI_BASE_URL (or LLM_BASE_URL) environment variable not set` | Relay 模式 `LLM_PROVIDER=openai` 但未设 Base URL |
| LLM 调用失败 | 检查 API Key / Base URL / 模型名是否正确 |
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
□ 3. CLI .env 配置完成（LLM Provider + PA_RELAY_URL + PA_RELAY_KEY）
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
