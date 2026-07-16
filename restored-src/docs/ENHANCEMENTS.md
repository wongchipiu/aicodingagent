# Personal Agent — Local CLI 增强版 v2

基于 `restored-src` 反编译代码的工程能力，重新实现的轻量级本地 AI Agent CLI。

## 快速开始

```bat
cd restored-src
start-local.bat
```

或手动设置环境变量后运行：

```bash
bun run src/entrypoints/local-cli.ts
# 恢复之前的会话
bun run src/entrypoints/local-cli.ts --resume my-session
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `LLM_PROVIDER` | `anthropic` 或 `openai`（默认 anthropic） |
| `ANTHROPIC_API_KEY` | Anthropic API Key |
| `ANTHROPIC_MODEL` | 模型名（默认 claude-sonnet-4-20250514） |
| `OPENAI_API_KEY` | OpenAI 兼容 API Key（火山引擎/DeepSeek/通义千问） |
| `OPENAI_BASE_URL` | API Base URL |
| `OPENAI_MODEL` | 模型名 |

## 工具集（23 个）

### 文件操作（5）
| 工具 | 功能 |
|------|------|
| FileRead | 读取文件内容（支持 offset/limit 分段读取） |
| FileWrite | 写入/创建文件（自动创建父目录） |
| FileEdit | 查找替换（支持 replace_all） |
| MultiEdit | 单文件多段查找替换（一次操作多组编辑） |
| NotebookEdit | Jupyter Notebook 单元格编辑（replace/insert/delete） |

### 搜索与网络（4）
| 工具 | 功能 |
|------|------|
| Grep | ripgrep 正则搜索（支持 glob/ignore 过滤） |
| Glob | 文件名 glob 匹配（支持 ignore 过滤） |
| WebSearch | DuckDuckGo 联网搜索 |
| WebFetch | 抓取网页转纯文本 |

### 命令执行（4）
| 工具 | 功能 |
|------|------|
| Bash | 跨平台 shell 命令执行 |
| PowerShell | Windows 原生 PowerShell（非 Win 降级 bash） |
| REPL | Python/JavaScript 代码执行（子进程 + 超时） |
| Sleep | 延时等待（轮询场景，最大 60s） |

### 版本控制（2）
| 工具 | 功能 |
|------|------|
| Git | git 操作封装（status/diff/log/add/commit/branch/checkout/pull/push/stash/raw） |
| Diff | 文件/文本差异对比（unified diff 格式） |

### 编排与交互（4）
| 工具 | 功能 |
|------|------|
| TodoWrite | 任务清单追踪（持久化到 .agent-todos.json） |
| AskUserQuestion | readline 交互提问澄清需求 |
| Agent | 子代理委派（独立上下文，递归执行） |
| ScheduleCron | 会话内定时提醒（create/list/cancel） |

### 代码智能（1）
| 工具 | 功能 |
|------|------|
| CodeDiagnostics | 语言 linter 诊断（TS/JS/Python/Go/Rust） |

### 外部集成（1）
| 工具 | 功能 |
|------|------|
| MCP | 连接外部 MCP 服务器（connect/list/call/disconnect） |

### 会话与记忆（2）
| 工具 | 功能 |
|------|------|
| SessionManage | 对话历史保存/加载/列表/导出（JSON/Markdown） |
| MemoryManage | 跨会话记忆增删改查（持久化到 ~/.agent-memory/） |

## 增强特性

### 1. 上下文自动压缩
对话历史超过 ~100K token 时，自动将旧消息总结成摘要，保留最近 12 条原文，防止 token 超限。

### 2. 子代理委派（Agent）
独立的对话上下文，共享 todos 和定时任务，禁用嵌套子代理。适合并行化独立子任务。

### 3. Hooks 系统
工具执行前后触发钩子事件（beforeTool/afterTool/beforeMessage/afterMessage/fileChanged）。默认注册日志审计钩子，记录到 `.agent-sessions/agent.log`。

### 4. 权限系统
危险操作（rm/push/format/sudo 等）执行前需用户 y/N 确认。支持自定义规则（addRule）。

### 5. 跨会话记忆
退出时自动从对话历史提取关键信息存盘（~/.agent-memory/memory.json），下次启动自动注入到系统提示。支持 MemoryManage 工具手动管理。

### 6. 会话持久化
`/save <name>` 保存对话，`--resume <name>` 恢复对话。支持导出为 Markdown。

### 7. 文件监控
chokidar 实时监控工作目录变更（自动忽略 node_modules/.git/dist），外部文件变化时终端通知。

### 8. LRU 文件缓存
文件读取内容缓存（路径归一化、25MB 上限），减少重复 IO。

### 9. 并发工具执行
使用 p-map 并行执行同轮次的多个工具调用（concurrency: 3）。

### 10. 终端 UI 美化
chalk 颜色 + figures 图标，工具调用/结果彩色输出，代码高亮。

### 11. MCP 外部工具集成
通过 Model Context Protocol 连接外部工具服务器，动态扩展 agent 能力。

## 内置命令

| 命令 | 功能 |
|------|------|
| `/save <name>` | 保存当前对话 |
| `/sessions` | 列出已保存会话 |
| `/memories` | 列出跨会话记忆 |
| `/tools` | 列出所有工具 |
| `exit` / `quit` / `/q` | 退出（自动保存记忆 + 清理资源） |

## 架构

```
restored-src/src/
├── entrypoints/
│   └── local-cli.ts              # 入口：对话循环 + 基础设施初始化 + 清理
├── llm/
│   └── provider.ts               # LLM Provider 抽象层（Anthropic / OpenAI 兼容）
└── local-cli/
    ├── types.ts                  # 共享类型定义
    ├── system-prompt.ts          # 系统提示生成（23 个工具）
    ├── compact.ts                # 上下文自动压缩
    ├── registry.ts               # 工具注册表 + 执行入口（集成 hooks + 权限）
    ├── ui.ts                     # 终端 UI 美化（chalk + figures）
    ├── cache.ts                  # LRU 缓存 + memoize + CircularBuffer
    ├── hooks.ts                  # Hooks 系统（事件发射器 + 日志审计）
    ├── permissions.ts            # 权限系统（危险操作确认）
    ├── memory.ts                 # 跨会话记忆（~/.agent-memory/）
    ├── session.ts                # 会话持久化（.agent-sessions/）
    ├── file-watcher.ts           # 文件监控（chokidar）
    ├── git-utils.ts              # Git 工具函数
    └── tools/
        ├── files.ts              # FileRead / FileWrite / FileEdit / MultiEdit
        ├── search.ts             # Grep / Glob / WebSearch / WebFetch
        ├── exec.ts               # Bash / PowerShell / REPL
        ├── orchestration.ts      # TodoWrite / AskUserQuestion / Agent / ScheduleCron
        ├── notebook.ts           # NotebookEdit
        ├── diff-tool.ts          # Diff
        ├── git.ts                # Git
        ├── sleep.ts              # Sleep
        ├── lsp.ts                # CodeDiagnostics
        ├── mcp.ts                # MCP
        └── session-tools.ts      # SessionManage / MemoryManage
```

## 实现说明

所有工具参考 `restored-src` 反编译代码的逻辑，用现有的 `ToolDefinition` 接口重新实现轻量版。原工具深度耦合 `buildTool` / React/Ink / `ToolUseContext` 等 80+ 内部依赖，无法直接 import。

### 依赖（package.json 已有）

| 包 | 用途 |
|----|------|
| `@anthropic-ai/sdk` | Anthropic API |
| `openai` | OpenAI 兼容 API |
| `@modelcontextprotocol/sdk` | MCP 协议 |
| `chalk` + `figures` | 终端 UI |
| `chokidar` | 文件监控 |
| `lru-cache` | LRU 缓存 |
| `p-map` | 并发控制 |
| `diff` | 差异对比 |
| `highlight.js` | 语法高亮 |
| `ignore` | .gitignore 解析 |
| `marked` | Markdown |

## 测试结果

- **单元测试**: 17/18 通过（唯一失败是环境缺 ripgrep，非代码问题）
- **启动验证**: 23 个工具全部注册，UI 美化正常
- **端到端验证**: 豆包 LLM 正确选择工具并执行

## 后续计划（批次 4）

- Team 多 agent 团队协作
- 子代理并行 spawn
