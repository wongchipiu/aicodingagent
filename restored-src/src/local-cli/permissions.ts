/**
 * 权限系统 — 危险操作确认 + 规则匹配
 *
 * 参考: restored-src/src/utils/permissions/
 * 对危险工具调用（rm、push、部署等）需用户确认
 */
import type { PermissionManager, PermissionDecision } from './types'
import * as ui from './ui'

// 默认需要确认的工具和命令模式
const DANGEROUS_PATTERNS: { tool: string; pattern?: RegExp; reason: string }[] = [
  { tool: 'Bash', pattern: /\b(rm\s|rmdir|del\s|format|mkfs|dd\s)/i, reason: 'destructive file operation' },
  { tool: 'Bash', pattern: /\b(git\s+push|git\s+reset\s+--hard|git\s+clean)/i, reason: 'destructive git operation' },
  { tool: 'Bash', pattern: /\b(npm\s+publish|docker\s+push|kubectl\s+delete)/i, reason: 'publish/delete operation' },
  { tool: 'Bash', pattern: /\b(sudo|chmod\s+777)/i, reason: 'privilege escalation' },
  { tool: 'PowerShell', pattern: /\b(Remove-Item|Format-|del\s)/i, reason: 'destructive operation' },
  { tool: 'FileWrite', reason: 'file overwrite' },
  { tool: 'FileEdit', reason: 'file modification' },
]

export function createPermissionManager(
  askUser: (q: string) => Promise<string>,
): PermissionManager {
  const rules: { pattern: string; decision: PermissionDecision; compiled: RegExp }[] = []

  function matchesRule(toolName: string, input: Record<string, unknown>): PermissionDecision | null {
    const command = (input.command as string) || ''
    const filePath = (input.file_path as string) || ''
    const target = `${toolName}:${command || filePath}`
    for (const rule of rules) {
      if (rule.compiled.test(target) || rule.compiled.test(toolName)) {
        return rule.decision
      }
    }
    return null
  }

  function isDangerous(toolName: string, input: Record<string, unknown>): string | null {
    for (const d of DANGEROUS_PATTERNS) {
      if (d.tool !== toolName) continue
      if (d.pattern) {
        const command = (input.command as string) || ''
        if (d.pattern.test(command)) return d.reason
      } else {
        return d.reason
      }
    }
    return null
  }

  return {
    async check(toolName: string, input: Record<string, unknown>): Promise<PermissionDecision> {
      // 1. 检查用户规则
      const ruleDecision = matchesRule(toolName, input)
      if (ruleDecision) return ruleDecision

      // 2. 检查危险模式
      const danger = isDangerous(toolName, input)
      if (!danger) return 'allow'

      // 3. 危险操作需确认
      return 'deny' // deny 表示需要进一步 request 确认
    },

    async request(toolName: string, input: Record<string, unknown>): Promise<boolean> {
      const danger = isDangerous(toolName, input)
      const command = (input.command as string) || (input.file_path as string) || JSON.stringify(input).slice(0, 100)
      const prompt = `\n  ${ui.warning('⚠ Permission required')}: ${toolName} — ${danger}\n  ${ui.dim('Command:')} ${command}\n  ${ui.dim('Allow? (y/N): ')}`
      const answer = await askUser(prompt)
      return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
    },

    addRule(pattern: string, decision: PermissionDecision) {
      rules.push({
        pattern,
        decision,
        compiled: new RegExp(pattern, 'i'),
      })
    },
  }
}
