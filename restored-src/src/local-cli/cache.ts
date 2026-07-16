/**
 * 缓存系统 — LRU 文件缓存 + TTL/异步 memoize
 *
 * 参考: restored-src/src/utils/memoize.ts, fileStateCache.ts
 * 依赖: lru-cache（package.json 已有）
 */
import { LRUCache } from 'lru-cache'
import type { FileCache } from './types'

const MAX_CACHE_SIZE = 100
const MAX_CACHE_BYTES = 25 * 1024 * 1024 // 25MB

export function createFileCache(): FileCache {
  const cache = new LRUCache<string, string>({
    max: MAX_CACHE_SIZE,
    maxSize: MAX_CACHE_BYTES,
    sizeCalculation: (val) => val.length,
  })

  return {
    get(key: string) {
      // 归一化路径键（兼容 Windows/Unix）
      const normalized = normalizeKey(key)
      return cache.get(normalized)
    },
    set(key: string, value: string) {
      const normalized = normalizeKey(key)
      cache.set(normalized, value)
    },
    has(key: string) {
      return cache.has(normalizeKey(key))
    },
    delete(key: string) {
      cache.delete(normalizeKey(key))
    },
    clear() {
      cache.clear()
    },
  }
}

function normalizeKey(key: string): string {
  return key.replace(/\\/g, '/').replace(/\/+/g, '/')
}

// ============================================================
// Memoize with TTL (write-through cache)
// ============================================================

type CacheEntry<T> = {
  value: T
  timestamp: number
  refreshing: boolean
}

export function memoizeWithTTL<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  cacheLifetimeMs: number = 5 * 60 * 1000,
): ((...args: Args) => Result) & { cache: { clear: () => void } } {
  const cache = new Map<string, CacheEntry<Result>>()

  const memoized = (...args: Args): Result => {
    const key = JSON.stringify(args)
    const cached = cache.get(key)
    const now = Date.now()

    if (!cached) {
      const value = fn(...args)
      cache.set(key, { value, timestamp: now, refreshing: false })
      return value
    }

    if (now - cached.timestamp > cacheLifetimeMs && !cached.refreshing) {
      cached.refreshing = true
      try {
        cached.value = fn(...args)
        cached.timestamp = now
      } finally {
        cached.refreshing = false
      }
    }

    return cached.value
  }

  memoized.cache = {
    clear: () => cache.clear(),
  }

  return memoized
}

// ============================================================
// Memoize async with TTL + in-flight dedup
// ============================================================

export function memoizeWithTTLAsync<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  cacheLifetimeMs: number = 5 * 60 * 1000,
): ((...args: Args) => Promise<Result>) & { cache: { clear: () => void } } {
  const cache = new Map<string, { value: Result; timestamp: number }>()
  const inflight = new Map<string, Promise<Result>>()

  const memoized = async (...args: Args): Promise<Result> => {
    const key = JSON.stringify(args)
    const cached = cache.get(key)
    const now = Date.now()

    if (cached && now - cached.timestamp < cacheLifetimeMs) {
      return cached.value
    }

    const existing = inflight.get(key)
    if (existing) return existing

    const promise = fn(...args).then((value) => {
      cache.set(key, { value, timestamp: now })
      inflight.delete(key)
      return value
    }).catch((e) => {
      inflight.delete(key)
      throw e
    })

    inflight.set(key, promise)
    return promise
  }

  memoized.cache = {
    clear: () => {
      cache.clear()
      inflight.clear()
    },
  }

  return memoized
}

// ============================================================
// CircularBuffer — 固定容量环形缓冲区
// ============================================================

export class CircularBuffer<T> {
  private buffer: (T | undefined)[]
  private head = 0
  private _size = 0
  private readonly capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
    this.buffer = new Array(capacity)
  }

  push(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this._size < this.capacity) this._size++
  }

  toArray(): T[] {
    const result: T[] = []
    const start = this._size < this.capacity ? 0 : this.head
    for (let i = 0; i < this._size; i++) {
      const idx = (start + i) % this.capacity
      const val = this.buffer[idx]
      if (val !== undefined) result.push(val)
    }
    return result
  }

  get size(): number {
    return this._size
  }

  clear(): void {
    this.buffer = new Array(this.capacity)
    this.head = 0
    this._size = 0
  }
}
