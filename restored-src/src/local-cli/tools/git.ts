/**
 * Git 工具 — 封装常用 git 操作
 *
 * 参考: restored-src/src/utils/git/
 * 调用 git-utils.ts 中的函数
 */
import { runGit, getGitStatus, getGitDiff, getGitLog, isGitRepo } from '../git-utils'
import type { ToolModule } from '../types'

export const gitTool: ToolModule = {
  definition: {
    name: 'Git',
    description:
      'Perform git operations: status, diff, log, add, commit, branch, etc. Use for version control tasks.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'diff', 'log', 'add', 'commit', 'branch', 'checkout', 'pull', 'push', 'stash', 'raw'],
          description: 'Git action to perform',
        },
        args: {
          type: 'string',
          description: 'Additional arguments (e.g. file paths for add, message for commit)',
        },
        staged: {
          type: 'boolean',
          description: 'For diff: show staged changes (default: false)',
        },
      },
      required: ['action'],
    },
  },
  async execute(input, ctx) {
    const action = input.action as string
    const args = (input.args as string) || ''
    const workDir = ctx.workDir

    if (!isGitRepo(workDir)) {
      return { content: 'Error: Not a git repository', isError: true }
    }

    try {
      switch (action) {
        case 'status': {
          const status = getGitStatus(workDir)
          const parts: string[] = [
            `Branch: ${status.branch}`,
            status.ahead > 0 || status.behind > 0
              ? `Ahead: ${status.ahead}, Behind: ${status.behind}`
              : '',
          ]
          if (status.staged.length > 0) {
            parts.push(`\nStaged (${status.staged.length}):`)
            status.staged.forEach((f) => parts.push(`  + ${f}`))
          }
          if (status.modified.length > 0) {
            parts.push(`\nModified (${status.modified.length}):`)
            status.modified.forEach((f) => parts.push(`  M ${f}`))
          }
          if (status.untracked.length > 0) {
            parts.push(`\nUntracked (${status.untracked.length}):`)
            status.untracked.forEach((f) => parts.push(`  ? ${f}`))
          }
          if (status.clean) parts.push('\nWorking tree clean')
          return { content: parts.filter(Boolean).join('\n'), isError: false }
        }
        case 'diff': {
          const staged = (input.staged as boolean) || false
          const diff = getGitDiff(workDir, staged)
          return { content: diff || '(no changes)', isError: false }
        }
        case 'log': {
          const log = getGitLog(workDir, 10)
          return { content: log, isError: false }
        }
        case 'add': {
          runGit(`add ${args || '.'}`, workDir)
          return { content: `Added: ${args || 'all'}`, isError: false }
        }
        case 'commit': {
          if (!args) return { content: 'Error: commit message required (use args)', isError: true }
          runGit(`commit -m "${args.replace(/"/g, '\\"')}"`, workDir)
          return { content: `Committed: ${args}`, isError: false }
        }
        case 'branch': {
          const branches = runGit('branch -a', workDir)
          return { content: branches, isError: false }
        }
        case 'checkout': {
          if (!args) return { content: 'Error: branch name required', isError: true }
          runGit(`checkout ${args}`, workDir)
          return { content: `Checked out: ${args}`, isError: false }
        }
        case 'pull': {
          const result = runGit('pull', workDir)
          return { content: result, isError: false }
        }
        case 'push': {
          const result = runGit('push', workDir)
          return { content: result, isError: false }
        }
        case 'stash': {
          const subCmd = args || 'push'
          const result = runGit(`stash ${subCmd}`, workDir)
          return { content: result, isError: false }
        }
        case 'raw': {
          if (!args) return { content: 'Error: raw command required (use args)', isError: true }
          const result = runGit(args, workDir)
          return { content: result, isError: false }
        }
        default:
          return { content: `Unknown git action: ${action}`, isError: true }
      }
    } catch (e: any) {
      return { content: `Git error: ${e.message}`, isError: true }
    }
  },
}
