/**
 * LLM Provider 抽象层
 *
 * 统一支持 Anthropic 原生 API 和 OpenAI 兼容 API（火山引擎方舟、DeepSeek、通义千问等）
 *
 * 通过环境变量 LLM_PROVIDER 切换：
 *   - anthropic (默认): 使用 @anthropic-ai/sdk
 *   - openai: 使用 openai SDK，兼容火山引擎方舟 / DeepSeek / 通义千问等
 *
 * 环境变量：
 *   通用:  LLM_PROVIDER=anthropic|openai
 *
 *   Anthropic 模式:
 *     ANTHROPIC_API_KEY   — API Key
 *     ANTHROPIC_MODEL     — 模型名 (默认 claude-sonnet-4-20250514)
 *     ANTHROPIC_BASE_URL  — 自定义 Base URL (可选，用于代理)
 *
 *   OpenAI 兼容模式 (火山引擎 / DeepSeek / 通义千问等):
 *     OPENAI_API_KEY   — API Key
 *     OPENAI_BASE_URL  — API Base URL (如火山引擎: https://ark.cn-beijing.volces.com/api/v3)
 *     OPENAI_MODEL     — 模型名 (如 doubao-pro-32k, deepseek-chat, qwen-max)
 *
 * 火山引擎配置示例:
 *   LLM_PROVIDER=openai
 *   OPENAI_API_KEY=your-volcengine-key
 *   OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
 *   OPENAI_MODEL=doubao-pro-32k
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// ============================================================
// 统一类型定义（内部统一使用 Anthropic 格式作为中间表示）
// ============================================================

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface TextBlock {
  type: 'text'
  text: string
}

export type ContentBlock = TextBlock | ToolUseBlock

export interface LLMResponse {
  /** 内容块数组（统一使用 Anthropic 格式） */
  content: ContentBlock[]
  /** 停止原因（Anthropic 格式: end_turn, tool_use, max_tokens） */
  stopReason: string | null
}

export interface LLMProvider {
  createMessage(params: {
    system: string
    messages: any[]
    tools: ToolDefinition[]
    abortSignal: AbortSignal
  }): Promise<LLMResponse>
}

// ============================================================
// Anthropic Provider（原生 API）
// ============================================================

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, baseURL?: string) {
    const opts: Anthropic.ClientOptions = { apiKey }
    if (baseURL) opts.baseURL = baseURL
    this.client = new Anthropic(opts)
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
  }

  async createMessage(params: {
    system: string
    messages: any[]
    tools: ToolDefinition[]
    abortSignal: AbortSignal
  }): Promise<LLMResponse> {
    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 4096,
        system: params.system,
        messages: params.messages,
        tools: params.tools as any,
      },
      { signal: params.abortSignal },
    )

    return {
      content: response.content as ContentBlock[],
      stopReason: response.stop_reason,
    }
  }
}

// ============================================================
// OpenAI Compatible Provider（火山引擎 / DeepSeek / 通义千问等）
// ============================================================

export class OpenAICompatibleProvider implements LLMProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, baseURL: string, model: string) {
    this.client = new OpenAI({ apiKey, baseURL })
    this.model = model
  }

  async createMessage(params: {
    system: string
    messages: any[]
    tools: ToolDefinition[]
    abortSignal: AbortSignal
  }): Promise<LLMResponse> {
    const openaiMessages = this.convertMessages(params.system, params.messages)
    const openaiTools = this.convertTools(params.tools)

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        max_tokens: 4096,
        messages: openaiMessages,
        tools: openaiTools,
      },
      { signal: params.abortSignal },
    )

    return this.convertResponse(response)
  }

  /**
   * 将 Anthropic 格式的消息历史转换为 OpenAI 格式
   *
   * Anthropic 格式:
   *   - system 是独立参数
   *   - 工具调用: assistant content 中的 tool_use block
   *   - 工具结果: user content 中的 tool_result block
   *
   * OpenAI 格式:
   *   - system 是 messages 数组第一条
   *   - 工具调用: assistant message 的 tool_calls 字段
   *   - 工具结果: role='tool' 的独立 message
   */
  private convertMessages(systemPrompt: string, messages: any[]): any[] {
    const result: any[] = [{ role: 'system', content: systemPrompt }]

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'user', content: msg.content })
        } else if (Array.isArray(msg.content)) {
          const toolResults = msg.content.filter((b: any) => b.type === 'tool_result')
          const textParts = msg.content.filter((b: any) => b.type === 'text')

          // 工具结果转为独立的 tool 消息
          if (toolResults.length > 0) {
            for (const tr of toolResults) {
              const content =
                typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content)
              result.push({
                role: 'tool',
                tool_call_id: tr.tool_use_id,
                content,
              })
            }
          }

          // 如果同一条消息中还有文本，追加为 user 消息
          if (textParts.length > 0) {
            result.push({ role: 'user', content: textParts.map((t: any) => t.text).join('\n') })
          }
        }
      } else if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          const textBlocks = msg.content.filter((b: any) => b.type === 'text')
          const toolUseBlocks = msg.content.filter((b: any) => b.type === 'tool_use')

          const assistantMsg: any = {
            role: 'assistant',
            content: textBlocks.length > 0 ? textBlocks.map((t: any) => t.text).join('\n') : null,
          }

          // tool_use 转为 tool_calls
          if (toolUseBlocks.length > 0) {
            assistantMsg.tool_calls = toolUseBlocks.map((tu: any) => ({
              id: tu.id,
              type: 'function',
              function: {
                name: tu.name,
                arguments: JSON.stringify(tu.input),
              },
            }))
          }

          result.push(assistantMsg)
        } else if (typeof msg.content === 'string') {
          result.push({ role: 'assistant', content: msg.content })
        }
      }
    }

    return result
  }

  /**
   * 将 Anthropic 格式的工具定义转换为 OpenAI function calling 格式
   *
   * Anthropic: { name, description, input_schema }
   * OpenAI:    { type: 'function', function: { name, description, parameters } }
   */
  private convertTools(tools: ToolDefinition[]): any[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
  }

  /**
   * 将 OpenAI 响应转换回 Anthropic 格式（统一内部表示）
   *
   * OpenAI:
   *   choice.message.content      — 文本内容
   *   choice.message.tool_calls   — 工具调用数组
   *   choice.finish_reason        — stop / tool_calls / length
   *
   * Anthropic:
   *   content[]                   — { type: 'text', text } | { type: 'tool_use', id, name, input }
   *   stop_reason                 — end_turn / tool_use / max_tokens
   */
  private convertResponse(response: any): LLMResponse {
    const choice = response.choices[0]
    const message = choice.message

    const content: ContentBlock[] = []

    // 文本内容
    if (message.content) {
      content.push({ type: 'text', text: message.content })
    }

    // 工具调用
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(tc.function.arguments)
        } catch {
          // 某些模型可能返回非 JSON 格式的参数
          input = { _raw: tc.function.arguments }
        }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input,
        })
      }
    }

    const finishReasonMap: Record<string, string> = {
      stop: 'end_turn',
      tool_calls: 'tool_use',
      length: 'max_tokens',
      content_filter: 'end_turn',
    }

    return {
      content,
      stopReason: finishReasonMap[choice.finish_reason] || choice.finish_reason,
    }
  }
}

// ============================================================
// 工厂函数
// ============================================================

export function createLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase()

  switch (provider) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable not set')
      }
      const baseURL = process.env.ANTHROPIC_BASE_URL
      const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
      console.log(`[LLM] Provider: Anthropic, Model: ${model}`)
      return new AnthropicProvider(apiKey, baseURL)
    }

    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY (or LLM_API_KEY) environment variable not set')
      }
      const baseURL = process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL
      if (!baseURL) {
        throw new Error('OPENAI_BASE_URL (or LLM_BASE_URL) environment variable not set')
      }
      const model = process.env.OPENAI_MODEL || process.env.LLM_MODEL || 'gpt-4o'
      console.log(`[LLM] Provider: OpenAI-compatible, Base URL: ${baseURL}, Model: ${model}`)
      return new OpenAICompatibleProvider(apiKey, baseURL, model)
    }

    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}". Supported values: "anthropic", "openai"`,
      )
  }
}
