# Personal Agent 改造计划

## 项目概述

打造一个**个人定制化的 AI Agent 框架**，基于开源 CLI 工具改造而来，服务于：
- 文件整理与自动化
- 系统监控
- 财经信息采集
- 股市量化策略开发
- iPhone 远程控制

---

## 一、运行方式

### 当前状态
- 源码已从 npm 包还原 (source map)
- 需要重新编译才能运行

### 运行步骤

```bash
# 1. 安装依赖
cd package
npm install  # 或使用 yarn/pnpm

# 2. 直接运行编译后的版本
node cli.js --help

# 3. 如需修改源码后运行，需要重新构建（见下方构建配置）
```

### 构建环境需求
- Node.js >= 18.0.0
- TypeScript
- tsx（直接运行 TypeScript，无需编译）

---

## 二、认证与依赖解耦方案

### 2.1 认证层改造 (P0 - 核心关键)

**目标**: 支持 OpenAI/本地模型/第三方 API，不再依赖原 OAuth 订阅体系

#### 需修改文件:

| 文件 | 改动内容 |
|------|----------|
| `src/services/api/client.ts` | 移除 OAuth 强依赖，支持自定义 API Key |
| `src/utils/auth.ts` | 移除原订阅检查逻辑 |
| `src/services/<limits>.ts` | 禁用配额检查，移除速率限制 |
| `src/services/<limitsHook>.ts` | 移除 quota hook |

**核心改动示例 (`client.ts`)**:
```typescript
// 原代码: 强制 OAuth
authToken: isOriginalSubscriber()
  ? getOriginalOAuthTokens()?.accessToken
  : undefined,

// 改为: 支持多种认证方式
apiKey: process.env.OPENAI_API_KEY ||
         getCustomApiKey(),
baseURL: process.env.API_BASE_URL || 'https://api.openai.com/v1',
```

### 2.2 系统提示词去品牌化 (P0)

**需修改文件:**

| 文件 | 改动内容 |
|------|----------|
| `src/constants/system.ts` | 修改 `DEFAULT_PREFIX` 为自定义名称 |
| `src/constants/prompts.ts` | 重写系统提示词，移除原产品名引用 |
| `src/constants/systemPromptSections.ts` | 调整各 section 内容 |

**改动示例 (`system.ts`)**:
```typescript
// 原代码: 包含原产品名和公司品牌
const DEFAULT_PREFIX = `You are [原产品名], [原公司]'s official CLI for [原产品名].`

// 改为:
const DEFAULT_PREFIX = `You are Personal Agent, a customizable AI assistant for productivity automation.`
```

### 2.3 API 层抽象化 (P1)

**目标**: 支持 OpenAI / Ollama / 本地 LLM / vLLM

**新增文件:**
- `src/services/api/providers/BaseProvider.ts`
- `src/services/api/providers/OpenAIProvider.ts`
- `src/services/api/providers/OllamaProvider.ts`

**修改文件:**
- `src/services/api/<provider>.ts` - 核心调用逻辑适配多 provider

### 2.4 移除限制相关模块 (P1)

以下模块可直接禁用或删除：

```
src/services/
├── analytics/          # 遥测数据收集 → 删除或禁用
├── policyLimits/       # 策略限制 → 绕过
├── remoteManagedSettings/  # 远程管理设置 → 删除
└── settingsSync/       # 设置同步 → 禁用

src/utils/
├── secureStorage/      # 安全存储(keychain) → 简化为文件存储
└── settings/mdm/       # MDM 管理 → 删除
```

---

## 三、个人定制功能开发计划

### 3.1 文件整理工具 (P0)

**新增工具目录:** `src/tools/FileOrganizerTool/`

**功能清单:**
- [ ] 智能文件分类 (按类型/日期/项目)
- [ ] 重复文件检测
- [ ] 批量重命名规则
- [ ] 自动归档 (压缩旧文件)
- [ ] 目录结构优化建议

**核心接口:**
```typescript
interface FileOrganizerConfig {
  sourceDir: string
  rules: ClassificationRule[]
  action: 'move' | 'copy' | 'archive' | 'delete'
  dryRun?: boolean
}
```

### 3.2 自动监控工具 (P0)

**新增工具目录:** `src/tools/MonitorTool/`

**功能清单:**
- [ ] 文件系统监控 (watchdog)
- [ ] 进程监控 (CPU/内存)
- [ ] 网站可用性检查
- [ ] 定时任务执行器 (增强现有 ScheduleCronTool)
- [ ] 异常告警通知

**核心接口:**
```typescript
interface MonitorConfig {
  type: 'filesystem' | 'process' | 'http' | 'custom'
  interval: number
  condition: MonitorCondition
  action: AlertAction
}
```

### 3.3 财经信息采集 (P1)

**新增工具目录:** `src/tools/FinanceDataTool/`

**数据源接入:**
- [ ] Yahoo Finance API
- [ ] 东方财富/同花顺 (国内)
- [ ] 财联社快讯
- [ ] Fed 经济数据
- [ ] 加密货币行情

**核心接口:**
```typescript
interface FinanceQuery {
  symbol: string          // 股票代码/加密货币
  dataSource: 'yahoo' | 'eastmoney' | 'coingecko'
  dataTypes: ('quote' | 'news' | 'financials' | 'history')[]
  dateRange?: { start: Date; end: Date }
}
```

### 3.4 股市量化策略引擎 (P1-P2)

**新增目录:** `src/tools/QuantStrategyTool/`

**功能架构:**
```
quant-strategy/
├── engine/
│   ├── BacktestEngine.ts     # 回测引擎
│   ├── SignalGenerator.ts    # 信号生成
│   └── PortfolioManager.ts   # 组合管理
├── strategies/
│   ├── MovingAverage.ts      # 均线策略
│   ├── RSIStrategy.ts        # RSI 策略
│   ├── MomentumStrategy.ts   # 动量策略
│   └── CustomStrategy.ts     # 自定义策略框架
├── indicators/
│   ├── technical.ts          # 技术指标库
│   └── fundamental.ts        # 基本面指标
└── analysis/
    ├── RiskAnalyzer.ts       # 风险分析
    └── PerformanceReport.ts  # 绩效报告
```

**核心能力:**
- [ ] 技术指标计算 (MA/EMA/MACD/RSI/KDJ/BOLL)
- [ ] 策略回测 (历史数据验证)
- [ ] 实盘信号推送
- [ ] 风险控制 (止损/仓位管理)
- [ ] 绩效归因分析

### 3.5 数据存储层 (P1)

**新增目录:** `src/services/storage/`

```typescript
interface StorageService {
  // 配置持久化
  saveConfig(config: AgentConfig): Promise<void>
  loadConfig(): Promise<AgentConfig>
  
  // 监控数据
  storeMetric(metric: MetricData): Promise<void>
  queryMetrics(query: MetricQuery): Promise<MetricData[]>
  
  // 财经数据缓存
  cacheFinanceData(data: FinanceCache): Promise<void>
  getCachedFinanceData(symbol: string): Promise<FinanceCache | null>
  
  // 策略运行记录
  logBacktest(result: BacktestResult): Promise<void>
  getBacktestHistory(): Promise<BacktestResult[]>
}
```

---

## 四、实施路线图

### Phase 1: 基础解耦 (Week 1)
- [x] 创建 feature/personal-agent 分支
- [x] 移除原 OAuth 强依赖 (`client.ts`, `auth.ts`)
- [x] 禁用 quota 检查 (`<limits>.ts`)
- [x] 修改系统提示词去品牌化 (`system.ts`, `prompts.ts`)
- [x] 支持 OpenAI API / 自定义 baseURL
- [x] 创建环境配置模板 (`.env.example`)
- [ ] 接入 OpenAI API 验证基本流程 (需重新编译)
- [ ] 禁用遥测和远程管理 (部分完成)

### Phase 2: 核心工具开发 (Week 2-3)
- [ ] 开发 FileOrganizerTool
- [ ] 开发 MonitorTool
- [ ] 增强 ScheduleCronTool

### Phase 3: 金融数据层 (Week 4)
- [ ] 开发 FinanceDataTool
- [ ] 接入多个数据源
- [ ] 实现数据缓存机制

### Phase 4: 量化策略引擎 (Week 5-6)
- [ ] 搭建回测引擎
- [ ] 实现技术指标库
- [ ] 开发内置策略
- [ ] 策略回测与优化

### Phase 5: 完善与部署 (Week 7-8)
- [ ] 配置管理界面
- [ ] Docker 化部署
- [ ] 文档编写
- [ ] 性能优化

### Phase 6: iPhone 远程控制 (Week 9-10)

**目标**: 通过 iPhone App 远程控制桌面端 Personal Agent。

#### 架构
```
iPhone App (SwiftUI) ←→ 中继服务器 (Node.js) ←→ CLI Agent (PC)
```

#### 已完成 (P0)
- [x] `shared-types/` — 共享协议类型（AgentMessage，替代 SDKMessage）
- [x] `relay/` — 中继服务器（HTTP API + WebSocket Hub + JWT 认证）
- [x] `restored-src/src/relay/` — CLI 端连接器（RelayConnector + 权限桥）
- [x] `restored-src/src/cli/handlers/remoteRelay.ts` — `pa remote-relay` 命令
- [x] `iphone-app/` — SwiftUI App（ChatView + LoginView + PermissionView）
- [x] 配对码认证机制（无 OAuth）

#### 待完成 (P1)
- [x] 接入 QueryEngine — 将 iPhone 消息注入 Agent 处理流程
- [x] 接入权限拦截 — 在 QueryEngine 的 ToolUseConfirm 处注入 relayPermissionBridge
- [x] 流式文本转发 — 将 Agent 回复实时推送到 iPhone
- [x] 多会话管理 — iPhone 可查看/切换活跃会话

#### 待完成 (P2)
- [x] APNs 推送通知 — 权限请求通过 iOS 推送提醒
- [x] Docker Compose 部署配置 + .env 模板
- [x] Swift Package Manager 配置 (Package.swift) — 替代 .xcodeproj
- [x] iPhone App Info.plist (ATS 允许 HTTP + 后台推送)
- [x] Assets.xcassets (AppIcon + AccentColor)
- [x] 端到端测试 (relay/test/e2e.ts — **15/15 测试全部通过**)
- [x] 完整集成文档 (docs/IPHONE_REMOTE_INTEGRATION.md)
- [x] 顶层 README.md 更新
- [ ] Docker 部署到内网 VPS（需 Docker 环境）

#### 自主可控保证
- LLM 通过 `OPENAI_API_KEY` + `API_BASE_URL` 环境变量配置，可切换任何 OpenAI 兼容 API
- 认证：自建 JWT + 预共享密钥 + 6 位配对码
- 中继：自建 Node.js WebSocket Hub
- 消息协议：自研 `AgentMessage` 类型
- 特性配置：环境变量，无远程 Feature Flag
- 无第三方云服务订阅检查

---

## 五、关键技术决策

### 5.1 模型选择
| 场景 | 推荐模型 | 原因 |
|------|----------|------|
| 通用对话 | GPT-4o / Claude Sonnet | 推理能力强 |
| 代码任务 | GPT-4o / DeepSeek Coder | 代码理解好 |
| 金融分析 | GPT-4o | 数据处理强 |
| 本地隐私 | Ollama + Qwen2.5 | 数据不出境 |
| 高频量化 | 小模型 + 规则引擎 | 延迟敏感 |

### 5.2 存储方案
- **配置文件**: JSON/YAML (用户目录 `.personal-agent/`)
- **时序数据**: SQLite (轻量、无需额外服务)
- **缓存**: 内存 + 文件持久化
- **日志**: 结构化 JSON 日志

### 5.3 部署架构
```
┌─────────────────────────────────┐
│         Docker Container         │
├─────────────────────────────────┤
│  Personal Agent CLI              │
│  ├── Tool Engine (文件/监控)     │
│  ├── Finance Module (数据采集)   │
│  └── Quant Engine (策略回测)     │
├─────────────────────────────────┤
│  Storage Layer                   │
│  ├── SQLite DB                  │
│  └── Config Files               │
├─────────────────────────────────┤
│  External APIs                  │
│  ├── OpenAI / Ollama (LLM)      │
│  ├── Yahoo Finance              │
│  └── Broker API (实盘)          │
└─────────────────────────────────┘
```

---

## 六、风险与注意事项

### 6.1 合规风险
- ⚠️ 金融数据采集需遵守相关法规
- ⚠️ 量化交易建议仅供参考，不构成投资建议
- ⚠️ 使用金融 API 注意调用频率限制

### 6.2 技术风险
- 原项目深度绑定单一供应商 SDK，解耦工作量大
- TypeScript 编译产物还原的代码可能不完整
- 可能需要处理编译时特性开关 (如 `feature('xxx')`)

### 6.3 建议
1. 先跑通最小可行性版本 (MVP)
2. 采用渐进式替换，而非一次性重写
3. 保持工具接口兼容，方便后续扩展
4. 充分测试金融数据的准确性

---

## 七、快速启动命令参考

```bash
# 进入项目目录
cd /path/to/personal-agent

# 查看当前分支
git branch

# 切换到开发分支
git checkout main

# 直接运行 CLI (需要 Node.js >= 18)
cd package && node cli.js

# 设置环境变量后运行 (推荐)
export OPENAI_API_KEY="your-key"
export API_BASE_URL="https://api.openai.com/v1"
node cli.js -p "帮我整理下载文件夹"
```

---

*文档创建时间: 2026-06-03*
*分支: feature/personal-agent*
