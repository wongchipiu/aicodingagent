/**
 * 命令执行工具：Bash / PowerShell / REPL
 *
 * 参考: restored-src/src/tools/PowerShellTool、REPLTool 的实现逻辑
 * （原工具深度耦合 buildTool/React/Ink 无法直接 import，此处重新实现）
 */
import { execSync, spawn } from 'child_process'
import type { ToolModule } from '../types'

export const bashTool: ToolModule = {
  definition: {
    name: 'Bash',
    description:
      'Execute a bash/shell command on the local machine. Use for running scripts, installing packages, git operations, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['command'],
    },
  },
  async execute(input, ctx) {
    const command = input.command as string
    const timeout = (input.timeout as number) || 30000
    try {
      const result = execSync(command, {
        cwd: ctx.workDir,
        encoding: 'utf-8',
        timeout,
        maxBuffer: 2 * 1024 * 1024,
      })
      return { content: result || '(no output)', isError: false }
    } catch (e: any) {
      const stderr = e.stderr || ''
      const stdout = e.stdout || ''
      return {
        content: `Command failed (exit ${e.status})\nstdout: ${stdout}\nstderr: ${stderr}\nerror: ${e.message}`,
        isError: true,
      }
    }
  },
}

export const powerShellTool: ToolModule = {
  definition: {
    name: 'PowerShell',
    description:
      'Execute a native PowerShell command (Windows-optimized). On non-Windows it falls back to bash. Prefer this over Bash for Windows-specific operations (registry, services, WMI, .NET, Get-ChildItem, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The PowerShell command to execute' },
      },
      required: ['command'],
    },
  },
  async execute(input, ctx) {
    const command = input.command as string
    // 非 Windows 降级到 bash
    if (process.platform !== 'win32') {
      try {
        const result = execSync(command, {
          cwd: ctx.workDir,
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 2 * 1024 * 1024,
          shell: process.env.SHELL || '/bin/bash',
        })
        return { content: result || '(no output)', isError: false }
      } catch (e: any) {
        return { content: `Command failed: ${e.message}`, isError: true }
      }
    }
    return new Promise((resolve) => {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        { cwd: ctx.workDir },
      )
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        ps.kill()
        resolve({ content: 'PowerShell command timed out (30s)', isError: true })
      }, 30000)
      ps.stdout.on('data', (d) => (stdout += d.toString()))
      ps.stderr.on('data', (d) => (stderr += d.toString()))
      ps.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) {
          resolve({ content: stdout || '(no output)', isError: false })
        } else {
          resolve({
            content: `PowerShell exited with code ${code}\nstderr: ${stderr}\nstdout: ${stdout}`,
            isError: true,
          })
        }
      })
      ps.on('error', (e) => {
        clearTimeout(timer)
        resolve({ content: `Failed to start PowerShell: ${e.message}`, isError: true })
      })
    })
  },
}

export const replTool: ToolModule = {
  definition: {
    name: 'REPL',
    description:
      'Execute a code snippet in Python or JavaScript and return the output. Use for quick computations, data processing, or verifying logic.',
    input_schema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python', 'javascript'],
          description: 'Programming language of the code',
        },
        code: { type: 'string', description: 'The code to execute' },
      },
      required: ['language', 'code'],
    },
  },
  async execute(input) {
    const language = input.language as string
    const code = input.code as string
    let cmd: string
    let args: string[]
    if (language === 'python') {
      cmd = process.platform === 'win32' ? 'python' : 'python3'
      args = ['-c', code]
    } else if (language === 'javascript') {
      // 用当前运行时可执行文件的完整路径，避免 spawn 找不到命令
      cmd = process.execPath
      args = ['-e', code]
    } else {
      return { content: `Unsupported language: ${language}`, isError: true }
    }
    return new Promise((resolve) => {
      let proc: any
      try {
        proc = spawn(cmd, args, { encoding: 'utf-8' })
      } catch (e: any) {
        resolve({
          content: `Failed to start ${cmd}: ${e.message}. Is ${cmd} installed?`,
          isError: true,
        })
        return
      }
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        proc.kill()
        resolve({ content: `${language} execution timed out (15s)`, isError: true })
      }, 15000)
      proc.stdout.on('data', (d: any) => (stdout += d.toString()))
      proc.stderr.on('data', (d: any) => (stderr += d.toString()))
      proc.on('close', (code: number) => {
        clearTimeout(timer)
        if (code === 0) {
          resolve({ content: stdout || '(no output)', isError: false })
        } else {
          resolve({
            content: `${language} exited with code ${code}\nstderr: ${stderr}\nstdout: ${stdout}`,
            isError: true,
          })
        }
      })
      proc.on('error', (e: any) => {
        clearTimeout(timer)
        resolve({
          content: `Failed to execute ${cmd}: ${e.message}. Is ${cmd} installed?`,
          isError: true,
        })
      })
    })
  },
}
