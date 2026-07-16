/**
 * 文件监控 — chokidar 实时监控工作目录变更
 *
 * 参考: restored-src/src/utils/hooks/fileChangedWatcher.ts
 * 依赖: chokidar（package.json 已有）
 */
import chokidar from 'chokidar'
import { resolve } from 'path'
import type { FileWatcher } from './types'

export function createFileWatcher(workDir: string): FileWatcher {
  let watcher: chokidar.FSWatcher | null = null
  let changeCallback: ((path: string) => void) | null = null
  const watchedPaths: string[] = []

  return {
    watch(paths: string[]) {
      // 停止旧 watcher
      if (watcher) {
        watcher.close()
      }

      const resolved = paths.map((p) => resolve(workDir, p))
      watchedPaths.length = 0
      watchedPaths.push(...resolved)

      watcher = chokidar.watch(resolved, {
        cwd: workDir,
        ignored: (p) => {
          // 忽略 node_modules, .git, dist 等
          return /(^|[\\/])node_modules([\\/]|$)/.test(p) ||
            /(^|[\\/])\.git([\\/]|$)/.test(p) ||
            /(^|[\\/])dist([\\/]|$)/.test(p) ||
            /(^|[\\/])\.agent-sessions([\\/]|$)/.test(p)
        },
        persistent: true,
        ignoreInitial: true,
        stabilityThreshold: 500, // 写入稳定性等待
      })

      watcher.on('change', (path: string) => {
        if (changeCallback) changeCallback(path)
      })

      watcher.on('add', (path: string) => {
        if (changeCallback) changeCallback(path)
      })
    },

    unwatch() {
      if (watcher) {
        watcher.close()
        watcher = null
      }
    },

    onChange(cb: (path: string) => void) {
      changeCallback = cb
    },

    stop() {
      if (watcher) {
        watcher.close()
        watcher = null
      }
      changeCallback = null
      watchedPaths.length = 0
    },
  }
}
