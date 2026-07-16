/**
 * 会话持久化 — 对话历史保存/恢复/导出
 *
 * 参考: restored-src/src/services/ 中会话管理逻辑
 * 存储: ./.agent-sessions/<name>.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import type { SessionManager } from './types'

const SESSIONS_DIR = '.agent-sessions'

export function createSessionManager(workDir: string): SessionManager {
  const sessionsPath = join(workDir, SESSIONS_DIR)
  let currentSession: string | null = null

  function ensureDir(): void {
    if (!existsSync(sessionsPath)) {
      mkdirSync(sessionsPath, { recursive: true })
    }
  }

  function sessionFile(name: string): string {
    return join(sessionsPath, `${name}.json`)
  }

  return {
    save(name: string, history: any[]): string {
      ensureDir()
      const data = {
        name,
        savedAt: new Date().toISOString(),
        messageCount: history.length,
        history,
      }
      writeFileSync(sessionFile(name), JSON.stringify(data, null, 2), 'utf-8')
      currentSession = name
      return `Session "${name}" saved (${history.length} messages)`
    },

    load(name: string): any[] | null {
      const file = sessionFile(name)
      if (!existsSync(file)) return null
      try {
        const data = JSON.parse(readFileSync(file, 'utf-8'))
        currentSession = name
        return data.history || []
      } catch {
        return null
      }
    },

    list(): string[] {
      if (!existsSync(sessionsPath)) return []
      try {
        return readdirSync(sessionsPath)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.replace(/\.json$/, ''))
      } catch {
        return []
      }
    },

    exportSession(name: string, format: 'json' | 'markdown'): string {
      const history = this.load(name)
      if (!history) return `Session "${name}" not found`

      if (format === 'json') {
        return JSON.stringify(history, null, 2)
      }

      // Markdown 导出
      const lines: string[] = [`# Session: ${name}`, ``, `Exported: ${new Date().toISOString()}`, ``]
      for (const msg of history) {
        const role = msg.role === 'user' ? '**User**' : msg.role === 'assistant' ? '**Assistant**' : `**${msg.role}**`
        if (typeof msg.content === 'string') {
          lines.push(`### ${role}`, ``, msg.content, ``)
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              lines.push(`### ${role}`, ``, block.text, ``)
            } else if (block.type === 'tool_use') {
              lines.push(`> Tool: \`${block.name}\``, `> \`\`\`json`, `> ${JSON.stringify(block.input)}`, `> \`\`\``, ``)
            } else if (block.type === 'tool_result') {
              const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
              lines.push(`> Result:`, `> \`\`\``, `> ${content.slice(0, 500)}`, `> \`\`\``, ``)
            }
          }
        }
      }
      return lines.join('\n')
    },

    getCurrent(): string | null {
      return currentSession
    },
  }
}
