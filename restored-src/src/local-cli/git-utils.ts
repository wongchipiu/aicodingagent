/**
 * Git 工具函数 — 封装常用 git 操作
 *
 * 参考: restored-src/src/utils/git/
 * 使用 execSync 调用 git CLI
 */
import { execSync } from 'child_process'

export interface GitStatus {
  branch: string
  staged: string[]
  modified: string[]
  untracked: string[]
  ahead: number
  behind: number
  clean: boolean
}

export function runGit(command: string, workDir: string): string {
  try {
    return execSync(`git ${command}`, {
      cwd: workDir,
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    }).trim()
  } catch (e: any) {
    throw new Error(`git ${command} failed: ${e.stderr || e.message}`)
  }
}

export function getGitStatus(workDir: string): GitStatus {
  const statusOutput = runGit('status --porcelain=v2 --branch', workDir)
  const lines = statusOutput.split('\n')

  let branch = 'unknown'
  let ahead = 0
  let behind = 0
  const staged: string[] = []
  const modified: string[] = []
  const untracked: string[] = []

  for (const line of lines) {
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+) -(\d+)/)
      if (match) {
        ahead = parseInt(match[1])
        behind = parseInt(match[2])
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // 已暂存或已修改
      const parts = line.split('\t')
      const filePath = parts[parts.length - 1]
      const field = line.split(' ')
      const xy = field[1]
      if (xy[0] !== '.') staged.push(filePath)
      if (xy[1] !== '.') modified.push(filePath)
    } else if (line.startsWith('? ')) {
      untracked.push(line.slice(2))
    }
  }

  return {
    branch,
    staged,
    modified,
    untracked,
    ahead,
    behind,
    clean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
  }
}

export function getGitDiff(workDir: string, staged: boolean = false): string {
  const flag = staged ? '--cached' : ''
  return runGit(`diff ${flag}`, workDir)
}

export function getGitLog(workDir: string, count: number = 10): string {
  return runGit(
    `log --oneline --graph -${count} --pretty=format:'%h %ad | %s%d [%an]' --date=short`,
    workDir,
  )
}

export function isGitRepo(workDir: string): boolean {
  try {
    runGit('rev-parse --git-dir', workDir)
    return true
  } catch {
    return false
  }
}
