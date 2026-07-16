/**
 * Diff 工具 — 文件/文本差异对比
 *
 * 参考: restored-src/src/utils/diff.ts
 * 依赖: diff（package.json 已有）
 */
import { readFileSync, existsSync } from 'fs'
import { structuredPatch } from 'diff'
import type { ToolModule } from '../types'
import * as ui from '../ui'

export const diffTool: ToolModule = {
  definition: {
    name: 'Diff',
    description:
      'Compare two files or text strings and show the differences in unified diff format. Use to review changes before/after edits.',
    input_schema: {
      type: 'object',
      properties: {
        file_path_a: { type: 'string', description: 'Path to the first file (or original)' },
        file_path_b: {
          type: 'string',
          description: 'Path to the second file (or modified). If omitted, uses text_b',
        },
        text_a: { type: 'string', description: 'Original text (alternative to file_path_a)' },
        text_b: { type: 'string', description: 'Modified text (alternative to file_path_b)' },
      },
    },
  },
  async execute(input) {
    try {
      let oldText: string
      let newText: string
      let labelA: string
      let labelB: string

      if (input.text_a !== undefined && input.text_b !== undefined) {
        oldText = input.text_a as string
        newText = input.text_b as string
        labelA = 'text_a'
        labelB = 'text_b'
      } else {
        const pathA = input.file_path_a as string
        const pathB = input.file_path_b as string
        if (!existsSync(pathA)) {
          return { content: `Error: File not found: ${pathA}`, isError: true }
        }
        oldText = readFileSync(pathA, 'utf-8')
        labelA = pathA
        if (pathB && existsSync(pathB)) {
          newText = readFileSync(pathB, 'utf-8')
          labelB = pathB
        } else if (input.text_b !== undefined) {
          newText = input.text_b as string
          labelB = 'text_b'
        } else {
          return { content: 'Error: Need either file_path_b or text_b', isError: true }
        }
      }

      const patch = structuredPatch(labelA, labelB, oldText, newText, '', '', { context: 3 })

      if (patch.hunks.length === 0) {
        return { content: 'No differences found.', isError: false }
      }

      // 格式化为 unified diff
      const lines: string[] = [
        `--- ${patch.oldFileName}`,
        `+++ ${patch.newFileName}`,
      ]

      let additions = 0
      let deletions = 0
      for (const hunk of patch.hunks) {
        lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
        for (const line of hunk.lines) {
          lines.push(line)
          if (line.startsWith('+')) additions++
          else if (line.startsWith('-')) deletions++
        }
      }

      const summary = `\n${lines.length} lines changed (+${additions} -${deletions})`
      return {
        content: lines.join('\n') + summary,
        isError: false,
      }
    } catch (e: any) {
      return { content: `Diff error: ${e.message}`, isError: true }
    }
  },
}
