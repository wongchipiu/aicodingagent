/**
 * 搜索与网络工具：Grep / Glob / WebSearch / WebFetch
 *
 * 参考: restored-src/src/tools/WebSearchTool、WebFetchTool 的实现逻辑
 * WebSearch 默认用 DuckDuckGo HTML 接口（免费无需 key），
 * 可通过环境变量 SEARCH_API_KEY + SEARCH_API_PROVIDER 切换付费 API（预留）。
 */
import { execSync } from 'child_process'
import type { ToolModule } from '../types'

export const grepTool: ToolModule = {
  definition: {
    name: 'Grep',
    description:
      'Search for a regex pattern in files using ripgrep. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'Directory or file to search in (default: cwd)' },
        glob: { type: 'string', description: 'File glob filter (e.g. *.ts)' },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to ignore (e.g. ["*.test.ts", "dist/**"])',
        },
      },
      required: ['pattern'],
    },
  },
  async execute(input, ctx) {
    const pattern = input.pattern as string
    const searchPath = (input.path as string) || ctx.workDir
    const glob = input.glob as string | undefined
    const ignore = input.ignore as string[] | undefined
    let cmd = `rg --line-number --no-heading`
    if (glob) cmd += ` -g "${glob}"`
    if (ignore) for (const ig of ignore) cmd += ` -g "!${ig}"`
    cmd += ` "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`
    try {
      const result = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
      })
      return { content: result || '(no matches)', isError: false }
    } catch (e: any) {
      if (e.status === 1) return { content: '(no matches)', isError: false }
      return { content: `Grep error: ${e.message}`, isError: true }
    }
  },
}

export const globTool: ToolModule = {
  definition: {
    name: 'Glob',
    description: 'Find files matching a glob pattern. Returns a list of file paths.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. **/*.ts, src/**/*.js)' },
        path: { type: 'string', description: 'Directory to search in (default: cwd)' },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to ignore (e.g. ["node_modules/**", "dist/**"])',
        },
      },
      required: ['pattern'],
    },
  },
  async execute(input, ctx) {
    const pattern = input.pattern as string
    const searchPath = (input.path as string) || ctx.workDir
    const ignore = input.ignore as string[] | undefined
    let cmd = `rg --files -g "${pattern}"`
    if (ignore) for (const ig of ignore) cmd += ` -g "!${ig}"`
    cmd += ` "${searchPath}"`
    try {
      const result = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
      })
      return { content: result || '(no files found)', isError: false }
    } catch (e: any) {
      return { content: `Glob error: ${e.message}`, isError: true }
    }
  },
}

interface SearchResult {
  title: string
  url: string
  snippet: string
}

export const webSearchTool: ToolModule = {
  definition: {
    name: 'WebSearch',
    description:
      'Search the web for real-time information. Returns titles, URLs, and snippets of top results. Use when you need current information, documentation, or facts beyond your training data.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default: 8)',
        },
      },
      required: ['query'],
    },
  },
  async execute(input) {
    const query = input.query as string
    const maxResults = (input.max_results as number) || 8
    try {
      const results = await duckDuckGoSearch(query, maxResults)
      if (results.length === 0) {
        return { content: `No results found for: ${query}`, isError: false }
      }
      const formatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join('\n\n')
      return { content: formatted, isError: false }
    } catch (e: any) {
      return { content: `WebSearch error: ${e.message}`, isError: true }
    }
  },
}

async function duckDuckGoSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  })
  if (!resp.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${resp.status}`)
  }
  const html = await resp.text()
  const results: SearchResult[] = []
  // DuckDuckGo HTML 结果块：result__a (标题链接) + result__snippet (摘要)
  const resultRegex =
    /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  let match
  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    const rawUrl = match[1]
    const title = decodeHtml(match[2]).trim()
    const snippet = decodeHtml(match[3]).trim()
    // DuckDuckGo 重定向链接解析: /l/?uddg=<encoded url>
    const urlMatch = rawUrl.match(/uddg=([^&]+)/)
    const realUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl
    results.push({ title, url: realUrl, snippet })
  }
  return results
}

function decodeHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

export const webFetchTool: ToolModule = {
  definition: {
    name: 'WebFetch',
    description:
      'Fetch content from a URL and convert it to readable text. Useful for reading web pages, documentation, or API responses.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch (http or https)' },
        max_chars: {
          type: 'number',
          description: 'Maximum characters to return (default: 8000)',
        },
      },
      required: ['url'],
    },
  },
  async execute(input) {
    const url = input.url as string
    const maxChars = (input.max_chars as number) || 8000
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
        redirect: 'follow',
      })
      if (!resp.ok) {
        return { content: `Fetch failed: HTTP ${resp.status}`, isError: true }
      }
      const contentType = resp.headers.get('content-type') || ''
      const raw = await resp.text()
      let text: string
      if (contentType.includes('application/json')) {
        text = raw
      } else if (contentType.includes('text/html')) {
        text = htmlToText(raw)
      } else {
        text = raw
      }
      if (text.length > maxChars) {
        text = text.slice(0, maxChars) + '\n\n[... truncated]'
      }
      return { content: text, isError: false }
    } catch (e: any) {
      return { content: `WebFetch error: ${e.message}`, isError: true }
    }
  },
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
