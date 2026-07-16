/**
 * 跨会话记忆系统 — 对话结束时自动提取关键信息存盘，下次启动加载
 *
 * 参考: restored-src/src/services/memory/ (extractMemories, memdir, SessionMemory)
 * 存储: ~/.agent-memory/memory.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { MemoryStore, MemoryItem } from './types'

const MEMORY_DIR = join(homedir(), '.agent-memory')
const MEMORY_FILE = join(MEMORY_DIR, 'memory.json')

export function createMemoryStore(): MemoryStore {
  function ensureDir(): void {
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true })
    }
  }

  function loadRaw(): MemoryItem[] {
    if (!existsSync(MEMORY_FILE)) return []
    try {
      const data = readFileSync(MEMORY_FILE, 'utf-8')
      return JSON.parse(data) as MemoryItem[]
    } catch {
      return []
    }
  }

  let cache: MemoryItem[] | null = null

  return {
    load(): MemoryItem[] {
      if (cache) return cache
      cache = loadRaw()
      return cache
    },

    save(memories: MemoryItem[]): void {
      ensureDir()
      writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf-8')
      cache = memories
    },

    add(title: string, content: string): MemoryItem {
      const memories = this.load()
      const item: MemoryItem = {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        content,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      memories.push(item)
      this.save(memories)
      return item
    },

    search(query: string): MemoryItem[] {
      const memories = this.load()
      const lower = query.toLowerCase()
      const terms = lower.split(/\s+/)
      return memories
        .map((m) => {
          const text = (m.title + ' ' + m.content).toLowerCase()
          let score = 0
          for (const term of terms) {
            if (text.includes(term)) score++
          }
          return { item: m, score }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.item)
    },

    delete(id: string): boolean {
      const memories = this.load()
      const idx = memories.findIndex((m) => m.id === id)
      if (idx === -1) return false
      memories.splice(idx, 1)
      this.save(memories)
      return true
    },

    getAll(): MemoryItem[] {
      return this.load()
    },
  }
}

/**
 * 从对话历史中提取记忆（简化版）
 * 提取最后几轮对话的摘要作为记忆
 */
export async function extractMemoryFromHistory(
  history: any[],
  summarizer: (text: string) => Promise<string>,
): Promise<{ title: string; content: string } | null> {
  // 取最近的用户消息和助手回复
  const recentMessages = history.slice(-10)
  const text = recentMessages
    .map((m) => {
      if (typeof m.content === 'string') return `[${m.role}] ${m.content}`
      if (Array.isArray(m.content)) {
        const texts = m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text)
        return `[${m.role}] ${texts.join(' ')}`
      }
      return ''
    })
    .join('\n')
    .slice(0, 5000)

  if (text.length < 50) return null

  try {
    const summary = await summarizer(text)
    // 从摘要中提取标题（第一行或前 50 字）
    const title = summary.split('\n')[0].slice(0, 50)
    return { title, content: summary }
  } catch {
    return null
  }
}
