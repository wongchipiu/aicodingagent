# Personal Agent 系统提示词审核报告

> 审核时间: 2026-07-11
> 审核范围: `restored-src/src/constants/` 及相关提示词文件
> 基于版本: Claude Code v2.1.88 source map 还原版 (feature/personal-agent 分支)

---

## 一、文件结构总览

| 文件 | 大小 | 职责 |
|------|------|------|
| `constants/system.ts` | 4 KB | 系统角色前缀定义 (DEFAULT_PREFIX) |
| `constants/prompts.ts` | 53 KB | 系统提示词主体 (最核心文件) |
| `constants/systemPromptSections.ts` | 1.8 KB | Section 缓存/管理机制 |
| `constants/cyberRiskInstruction.ts` | 1.5 KB | 网络安全风险指令 |
| `constants/outputStyles.ts` | 9.9 KB | 输出风格定义 |
| `utils/systemPrompt.ts` | — | 提示词组装逻辑 |
| `utils/systemPromptType.ts` | — | SystemPrompt 品牌类型 |
| `coordinator/coordinatorMode.ts` | — | 协调者模式提示词 |
| `tools/AgentTool/built-in/*.ts` | — | 内建子 Agent 提示词 |
| `services/compact/prompt.ts` | — | 上下文压缩提示词 |
| `services/extractMemories/prompts.ts` | — | 记忆提取提示词 |
| `utils/swarm/teammatePromptAddendum.ts` | — | 团队协作附加提示词 |
| `buddy/prompt.ts` | — | 伴侣角色提示词 |

---

## 二、身份定义 (`system.ts`)

已改造为 Personal Agent，三种角色前缀：

```typescript
// CLI 交互模式
const DEFAULT_PREFIX = `You are Personal Agent (PA), a customizable AI assistant for productivity automation, file management, monitoring, finance data collection, and quantitative strategy development.`

// Agent SDK 模式（程序化调用）
const AGENT_SDK_PA_PRESET_PREFIX = `You are Personal Agent (PA), a customizable AI assistant running within an agent SDK framework.`

// 通用 Agent 模式（子 Agent）
const AGENT_SDK_PREFIX = `You are a Personal Agent, built on an extensible AI agent framework.`
```

`getCLISyspromptPrefix()` 根据运行模式选择前缀，`getAttributionHeader()` 生成 API 请求归属头。

---

## 三、核心行为规范 (`prompts.ts`)

### 3.1 静态部分（可缓存，跨会话不变）

| Section | 函数 | 功能/行为规范 |
|---------|------|--------------|
| **Intro** | `getSimpleIntroSection()` | Agent 身份介绍；`CYBER_RISK_INSTRUCTION` 安全指令；禁止猜测 URL |
| **System** | `getSimpleSystemSection()` | 文本输出方式；工具权限模式；`<system-reminder>` 标签处理；prompt injection 检测；hooks 机制；自动上下文压缩 |
| **Doing Tasks** | `getSimpleDoingTasksSection()` | 软件工程任务优先；不创建不必要文件；先读后改；安全编码（防 OWASP Top 10）；最小复杂度；不过度设计 |
| **Actions** | `getActionsSection()` | 区分可逆/不可逆操作；危险操作需确认（删除/force-push/发消息）；不绕过安全检查 |
| **Using Tools** | `getUsingYourToolsSection()` | 优先专用工具（Read/Edit/Write/Glob/Grep）而非 Bash；并行调用独立工具；任务管理 |
| **Tone and Style** | `getSimpleToneAndStyleSection()` | 不用 emoji（除非要求）；简洁；`file:line` 引用格式 |
| **Output Efficiency** | `getOutputEfficiencySection()` | 直奔主题；先答案后推理；跳过废话 |

### 3.2 动态部分（每轮会话重新计算）

| Section | 内容 |
|---------|------|
| `session_guidance` | 会话指导：Agent 工具使用、Explore agent、Skills、Verification Agent |
| `memory` | 从 `memdir` 加载的记忆提示 |
| `env_info_simple` | 环境信息：CWD、git 分支、平台、Shell、OS、模型名称、知识截止日期 |
| `language` | 语言偏好（中文/英文） |
| `output_style` | 输出风格（Explanatory / Learning） |
| `mcp_instructions` | MCP 服务器指令（动态，每轮重计算） |
| `scratchpad` | 临时文件目录说明 |
| `frc` | Function Result Clearing（自动清理旧工具结果） |
| `summarize_tool_results` | 提示将重要信息写入回复中 |
| `token_budget` | Token 预算模式指令 |

---

## 四、安全指令 (`cyberRiskInstruction.ts`)

由 Safeguards 团队维护的安全边界：

> IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes.

**允许**：授权安全测试、防御性安全、CTF 挑战、教育场景

**拒绝**：破坏性技术、DoS 攻击、大规模定向攻击、供应链攻击、恶意规避检测

---

## 五、多 Agent 编排

### 5.1 协调者模式 (`coordinator/coordinatorMode.ts`)

| 属性 | 说明 |
|------|------|
| 角色 | coordinator（编排者），通过 Agent 工具派发 worker |
| 工具 | Agent（spawn worker）、SendMessage（继续 worker）、TaskStop（停止 worker） |
| 工作流 | 理解需求 → 分派研究/实现/验证 → 综合结果 |
| 通信格式 | Worker 结果以 `<task-notification>` XML 格式返回 |

### 5.2 内建子 Agent (`tools/AgentTool/built-in/`)

| Agent | 文件 | 职责 | 权限 |
|-------|------|------|------|
| **General Purpose** | `generalPurposeAgent.ts` | 通用搜索/分析/多步骤研究 | 读写 |
| **Explore** | `exploreAgent.ts` | 快速文件搜索、代码搜索、代码库探索 | 只读 |
| **Plan** | `planAgent.ts` | 代码库探索 + 实现方案设计 | 只读 |
| **Verification** | `verificationAgent.ts` | 对抗性验证，尝试"打破"实现，输出 PASS/FAIL/PARTIAL | 读写 |

---

## 六、自主工作模式 (Proactive)

`getProactiveSection()` 定义的自主运行模式：

| 特性 | 说明 |
|------|------|
| **存活机制** | 通过 `<tick>` 提示保持存活，Sleep 工具控制节奏 |
| **首次唤醒** | 问候用户并询问方向 |
| **后续唤醒** | 主动寻找有用工作，不空转 |
| **响应性** | 用户活跃时保持紧密反馈循环 |
| **行动偏好** | 读文件/搜索代码/运行测试/做代码变更都无需询问 |
| **简洁性** | 只输出决策、里程碑状态、错误/阻塞 |
| **终端焦点感知** | 根据 `terminalFocus` 调整自主程度 |

---

## 七、上下文管理

| 机制 | 文件 | 说明 |
|------|------|------|
| **Compact** | `services/compact/prompt.ts` | 对话过长时自动压缩，生成 9 部分摘要（请求/技术/文件/修复/问题/消息/待办/当前/下一步） |
| **FRC** | prompts.ts | Function Result Clearing，自动清理旧工具结果 |
| **Memory** | `services/extractMemories/prompts.ts` | 后台记忆提取 Agent，分析消息并更新持久化记忆 |

---

## 八、输出风格 (`outputStyles.ts`)

| 风格 | 说明 |
|------|------|
| **Default** | 标准输出，简洁直接 |
| **Explanatory** | 详细解释代码原理和设计决策 |
| **Learning** | 教学模式，引导用户思考而非直接给答案 |

---

## 九、缓存优化 (`systemPromptSections.ts`)

静态/动态内容分离，Section 级缓存：

```typescript
// 缓存型 Section — 计算一次后缓存直到 /clear 或 /compact
systemPromptSection(name, compute)

// 非缓存型 Section — 每轮重计算（如 MCP 指令）
DANGEROUS_uncachedSystemPromptSection(name, compute, reason)
```

- **静态部分**（Intro/System/Tasks/Actions/Tools/Tone）— 缓存
- **动态部分**（env/memory/mcp/language）— 每轮重计算
- `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 标记分隔两者

---

## 十、团队协作 (`swarm/`)

| 特性 | 说明 |
|------|------|
| 模式 | Teammate 模式，多 Agent 并行工作 |
| 通信 | `SendMessage` 工具 |
| 提示词 | 追加到系统提示词的团队协作指令 |

---

## 十一、伴侣模式 (`buddy/prompt.ts`)

输入框旁的 companion 角色，与主 Agent 分离，提供辅助交互。

---

## 十二、工具权限体系

提示词中定义的工具使用权限层级：

| 层级 | 工具 | 行为 |
|------|------|------|
| **自动允许** | Read、Glob、Grep、TodoWrite、WebSearch 等 | 只读/安全工具，无需确认 |
| **需确认** | Bash、Write、Edit、MultiEdit | 可能修改系统的工具 |
| **危险操作** | 删除文件、git force-push、发送消息 | 需额外确认 |

---

## 十三、环境感知

提示词中注入的运行时上下文：

| 信息 | 来源 |
|------|------|
| 当前工作目录 | `process.cwd()` |
| Git 状态 | `git status` + `git branch` |
| 操作系统 | `os.platform()` |
| Shell 类型 | `process.env.SHELL` |
| 模型名称 | 配置的 LLM 模型 |
| 知识截止日期 | 模型常量 |
| 终端焦点状态 | proactive 模式专用 |

---

## 十四、提示词组装优先级 (`utils/systemPrompt.ts`)

`buildEffectiveSystemPrompt()` 按优先级组装：

```
0. Override    — 覆盖模式（loop 模式），替换所有其他提示词
1. Coordinator — 协调者模式（多 worker 编排）
2. Agent       — 主线程 Agent 定义（proactive 模式下追加而非替换）
3. Custom      — 自定义系统提示词（--system-prompt）
4. Default     — 标准 Personal Agent 提示词
```

---

## 十五、关键常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` | — | 分隔静态/动态内容的边界标记 |
| `CLAUDE_CODE_DOCS_MAP_URL` | — | 文档 URL |
| `DEFAULT_AGENT_PROMPT` | — | 子 Agent 默认提示词 |
| `FRONTIER_MODEL_NAME` | `'GPT-4o / 通用前沿模型'` | 前沿模型名称占位（用户可在 .env 中自定义） |

---

## 十六、改造状态与待办

### 已完成（Phase 1）

- [x] `system.ts` — DEFAULT_PREFIX 已改为 Personal Agent
- [x] `prompts.ts` — 部分品牌名已替换
- [x] 认证层去 OAuth（`client.ts`、`auth.ts`）
- [x] 支持 OpenAI/Ollama 等多 LLM provider

### 待改造

- [ ] `prompts.ts` 中可能仍有外部品牌残留，需全文搜索替换
- [ ] 系统提示词中如出现 "developed by" / "powered by" 等归属描述需移除
- [ ] proactive 模式提示词中的品牌引用待审查
- [ ] 输出风格中的品牌引用待审查

---

## 十七、总结

原始系统的 prompt 体系是一个**生产级 AI Coding Agent 提示词框架**，覆盖：

```
身份定义 → 安全边界 → 工具使用 → 任务执行 → 多Agent编排 → 上下文管理 → 环境感知 → 缓存优化
```

Personal Agent 改造已将核心品牌名替换为 Personal Agent (PA)，行为规范完全保留。后续需进一步清理残留的品牌引用，确保完全自主可控。

---

*文档创建时间: 2026-07-11*
*分支: feature/personal-agent*
