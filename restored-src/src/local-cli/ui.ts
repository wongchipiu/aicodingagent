/**
 * 终端 UI 美化 — chalk 颜色 + figures 图标
 *
 * 参考: restored-src/src/utils 中 chalk/figures 的使用方式
 */
import chalk from 'chalk'
import figures from 'figures'

export function toolName(name: string): string {
  return chalk.cyan.bold(name)
}

export function toolResult(msg: string): string {
  return chalk.gray(msg)
}

export function error(msg: string): string {
  return chalk.red(msg)
}

export function success(msg: string): string {
  return chalk.green(msg)
}

export function warning(msg: string): string {
  return chalk.yellow(msg)
}

export function info(msg: string): string {
  return chalk.blue(msg)
}

export function path(p: string): string {
  return chalk.blue.underline(p)
}

export function header(text: string): string {
  return chalk.magenta.bold(`  ${figures.pointer} ${text}`)
}

export function bullet(text: string): string {
  return `${chalk.gray(figures.bullet)} ${text}`
}

export function dim(text: string): string {
  return chalk.dim(text)
}

export function highlightCode(code: string, lang?: string): string {
  // 轻量语法高亮：对常见关键字、字符串、注释着色
  // （完整 highlight.js 输出 HTML，终端需 ANSI 转换，这里用正则方案）
  if (!code) return code
  let result = code
  // 注释 (// ... 和 # ...)
  result = result.replace(/(\/\/[^\n]*)/g, chalk.gray('$1'))
  result = result.replace(/(^|\s)(#[^\n]*)/g, '$1' + chalk.gray('$2'))
  // 字符串
  result = result.replace(/(["'`])((?:\\.|(?!\1).)*)\1/g, chalk.green('$1$2$1'))
  // 关键字
  const keywords = [
    'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
    'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch',
    'def', 'print', 'True', 'False', 'None', 'self', 'lambda', 'with', 'as',
    'public', 'private', 'static', 'void', 'int', 'string', 'bool',
  ]
  for (const kw of keywords) {
    const re = new RegExp(`\\b${kw}\\b`, 'g')
    result = result.replace(re, chalk.yellow(kw))
  }
  // 数字
  result = result.replace(/\b(\d+\.?\d*)\b/g, chalk.cyan('$1'))
  return result
}

export function diffLine(line: string): string {
  if (line.startsWith('+')) return chalk.green(line)
  if (line.startsWith('-')) return chalk.red(line)
  if (line.startsWith('@@')) return chalk.cyan(line)
  return chalk.dim(line)
}

export function formatToolCall(name: string, input: Record<string, unknown>): string {
  const inputStr = JSON.stringify(input)
  const preview = inputStr.length > 200 ? inputStr.slice(0, 200) + '...' : inputStr
  return `${header(name)} ${chalk.gray(preview)}`
}

export function formatToolResult(content: string, isError: boolean): string {
  const icon = isError ? chalk.red(figures.cross) : chalk.green(figures.tick)
  const preview = content.length > 500 ? content.slice(0, 500) + '...' : content
  return `  ${icon} ${isError ? error(preview) : toolResult(preview)}`
}
