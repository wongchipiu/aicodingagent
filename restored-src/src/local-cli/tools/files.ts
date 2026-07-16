/**
 * 文件操作工具：FileRead / FileWrite / FileEdit
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { ToolModule } from '../types'

export const fileReadTool: ToolModule = {
  definition: {
    name: 'FileRead',
    description:
      'Read the contents of a file. Supports optional line offset and limit for partial reads.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to read' },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-based, optional)',
        },
        limit: { type: 'number', description: 'Maximum number of lines to read (optional)' },
      },
      required: ['file_path'],
    },
  },
  async execute(input) {
    const filePath = input.file_path as string
    if (!existsSync(filePath)) {
      return { content: `Error: File not found: ${filePath}`, isError: true }
    }
    const content = readFileSync(filePath, 'utf-8')
    const offset = input.offset as number | undefined
    const limit = input.limit as number | undefined
    if (offset || limit) {
      const lines = content.split('\n')
      const start = offset ? offset - 1 : 0
      const end = limit ? start + limit : lines.length
      return { content: lines.slice(start, end).join('\n'), isError: false }
    }
    return { content, isError: false }
  },
}

export const fileWriteTool: ToolModule = {
  definition: {
    name: 'FileWrite',
    description:
      'Write content to a file. Creates the file (and parent dirs) if needed, overwrites if it exists.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to write' },
        content: { type: 'string', description: 'Content to write to the file' },
      },
      required: ['file_path', 'content'],
    },
  },
  async execute(input) {
    const filePath = input.file_path as string
    const content = input.content as string
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
    return {
      content: `File written: ${filePath} (${content.length} chars)`,
      isError: false,
    }
  },
}

export const fileEditTool: ToolModule = {
  definition: {
    name: 'FileEdit',
    description:
      'Replace text in a file using find-and-replace. Fails if old_text is not found. Set replace_all to replace every occurrence.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit' },
        old_text: {
          type: 'string',
          description: 'The exact text to find (must match exactly including whitespace)',
        },
        new_text: { type: 'string', description: 'The text to replace it with' },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace all occurrences (default: false, replaces first only)',
        },
      },
      required: ['file_path', 'old_text', 'new_text'],
    },
  },
  async execute(input) {
    const filePath = input.file_path as string
    const oldText = input.old_text as string
    const newText = input.new_text as string
    const replaceAll = (input.replace_all as boolean) || false
    if (!existsSync(filePath)) {
      return { content: `Error: File not found: ${filePath}`, isError: true }
    }
    const content = readFileSync(filePath, 'utf-8')
    if (!content.includes(oldText)) {
      return { content: `Error: old_text not found in ${filePath}`, isError: true }
    }
    const newContent = replaceAll
      ? content.split(oldText).join(newText)
      : content.replace(oldText, newText)
    writeFileSync(filePath, newContent, 'utf-8')
    return { content: `File edited: ${filePath}`, isError: false }
  },
}

export const multiEditTool: ToolModule = {
  definition: {
    name: 'MultiEdit',
    description:
      'Make multiple find-and-replace edits to a single file in one operation. Edits are applied sequentially. Fails if any old_text is not found.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit' },
        edits: {
          type: 'array',
          description: 'List of edits to apply sequentially',
          items: {
            type: 'object',
            properties: {
              old_text: { type: 'string', description: 'Text to find' },
              new_text: { type: 'string', description: 'Text to replace with' },
            },
            required: ['old_text', 'new_text'],
          },
        },
      },
      required: ['file_path', 'edits'],
    },
  },
  async execute(input) {
    const filePath = input.file_path as string
    const edits = input.edits as { old_text: string; new_text: string }[]
    if (!existsSync(filePath)) {
      return { content: `Error: File not found: ${filePath}`, isError: true }
    }
    let content = readFileSync(filePath, 'utf-8')
    let applied = 0
    for (const edit of edits) {
      if (!content.includes(edit.old_text)) {
        return {
          content: `Error: old_text not found (edit ${applied + 1}/${edits.length}) in ${filePath}`,
          isError: true,
        }
      }
      content = content.replace(edit.old_text, edit.new_text)
      applied++
    }
    writeFileSync(filePath, content, 'utf-8')
    return {
      content: `File edited: ${filePath} (${applied} edits applied)`,
      isError: false,
    }
  },
}
