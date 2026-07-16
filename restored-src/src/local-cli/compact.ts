/**
 * 上下文压缩服务
 *
 * 当对话历史估算 token 超过阈值时，自动将旧消息总结成一段摘要，
 * 保留最近 N 轮原文，防止 token 超限导致 API 报错。
 *
 * 参考: restored-src/src/services/compact/compact.ts 的逻辑（原模块深度耦合
 * 80+ 内部依赖无法直接 import，此处用轻量方式重新实现）。
 */
import type { LLMProvider } from '../../llm/provider'

const APPROX_TOKEN_THRESHOLD = 100000 // ~100K tokens 触发压缩
const CHARS_PER_TOKEN = 4
const KEEP_RECENT = 12 // 保留最近 12 条消息（约 6 轮）原文

export function estimateTokens(messages: any[]): number {
  let chars = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') chars += block.text.length
        else if (block.type === 'tool_use') chars += JSON.stringify(block.input).length
        else if (block.type === 'tool_result') {
          chars +=
            typeof block.content === 'string'
              ? block.content.length
              : JSON.stringify(block.content).length
        }
      }
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

export async function compactIfNeeded(
  provider: LLMProvider,
  messages: any[],
): Promise<boolean> {
  const tokens = estimateTokens(messages)
  if (tokens < APPROX_TOKEN_THRESHOLD) return false

  if (messages.length <= KEEP_RECENT) return false

  console.log(`\n  [Compact] Context ~${tokens} tokens exceeds threshold, compacting...`)

  const toSummarize = messages.slice(0, messages.length - KEEP_RECENT)
  const recent = messages.slice(messages.length - KEEP_RECENT)

  try {
    const response = await provider.createMessage({
      system:
        'You are a conversation summarizer. Be concise but preserve all important details: decisions, file paths, tool results, open tasks.',
      messages: [
        {
          role: 'user',
          content:
            'Summarize the following conversation history concisely. Preserve: key decisions, file paths mentioned, important tool results, and any open tasks. Output a single summary paragraph.\n\n' +
            JSON.stringify(toSummarize).slice(0, 50000),
        },
      ],
      tools: [],
      abortSignal: new AbortController().signal,
    })

    const summary = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')

    // 原地清空并重建
    messages.length = 0
    messages.push({
      role: 'user',
      content: `[Previous conversation summary]\n${summary}`,
    })
    messages.push({
      role: 'assistant',
      content: 'Understood, I have the context from the summary. How can I help?',
    })
    messages.push(...recent)

    console.log(`  [Compact] Done. Reduced to ~${estimateTokens(messages)} tokens.`)
    return true
  } catch (e: any) {
    console.log(`  [Compact] Failed: ${e.message}`)
    return false
  }
}
