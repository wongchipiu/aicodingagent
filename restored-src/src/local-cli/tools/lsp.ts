/**
 * 代码诊断工具 — 轻量版 LSP，调用各语言 linter/compiler
 *
 * 参考: restored-src/src/tools/LSPTool/ + services/lsp/
 * 轻量方案：用 CLI linter 代替完整 LSP 协议栈
 *   - TypeScript/JavaScript: tsc --noEmit / eslint
 *   - Python: python -m py_compile / pylint
 *   - Go: go vet
 *   - Rust: cargo check
 */
import { execSync } from 'child_process'
import { extname, basename } from 'path'
import type { ToolModule } from '../types'

export const lspTool: ToolModule = {
  definition: {
    name: 'CodeDiagnostics',
    description:
      'Run language-specific linters/compilers to get code diagnostics (errors, warnings). Supports TypeScript, JavaScript, Python, Go, Rust. Returns formatted diagnostic output.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to check' },
        action: {
          type: 'string',
          enum: ['diagnostics', 'check'],
          description: 'Action: diagnostics (lint) or check (compile check)',
        },
      },
      required: ['file_path'],
    },
  },
  async execute(input, ctx) {
    const filePath = input.file_path as string
    const ext = extname(filePath).toLowerCase()
    const fileName = basename(filePath)

    let cmd: string | null = null
    let label = ''

    // 根据扩展名选择 linter
    switch (ext) {
      case '.ts':
      case '.tsx':
        cmd = `npx tsc --noEmit --pretty false "${filePath}" 2>&1`
        label = 'TypeScript (tsc)'
        break
      case '.js':
      case '.jsx':
      case '.mjs':
        // 优先 eslint，降级 node --check
        cmd = `npx eslint --format compact "${filePath}" 2>&1 || node --check "${filePath}" 2>&1`
        label = 'JavaScript (eslint/node)'
        break
      case '.py':
        cmd = `python -m py_compile "${filePath}" 2>&1`
        label = 'Python (py_compile)'
        break
      case '.go':
        cmd = `go vet "${filePath}" 2>&1`
        label = 'Go (go vet)'
        break
      case '.rs':
        cmd = `cargo check --message-format=short 2>&1`
        label = 'Rust (cargo check)'
        break
      default:
        return {
          content: `No linter configured for ${ext} files. Supported: .ts .tsx .js .jsx .py .go .rs`,
          isError: false,
        }
    }

    try {
      const result = execSync(cmd, {
        cwd: ctx.workDir,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
      })

      // 如果有输出，说明有诊断信息
      if (result && result.trim()) {
        return {
          content: `[${label}] Diagnostics for ${fileName}:\n\n${result.trim()}`,
          isError: false,
        }
      }

      return {
        content: `[${label}] ${fileName}: No issues found.`,
        isError: false,
      }
    } catch (e: any) {
      // linter 发现问题时通常以非零退出码退出，但 stderr/stdout 包含诊断信息
      const output = e.stdout || e.stderr || e.message || ''
      if (output.trim()) {
        return {
          content: `[${label}] Diagnostics for ${fileName}:\n\n${output.trim()}`,
          isError: false, // 诊断信息不是执行错误
        }
      }
      return {
        content: `[${label}] Check failed: ${e.message}. Is ${label.split(' ')[0]} installed?`,
        isError: true,
      }
    }
  },
}
