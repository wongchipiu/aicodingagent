/**
 * NotebookEdit 工具 — 编辑 Jupyter Notebook (.ipynb) 单元格
 *
 * 参考: restored-src/src/tools/NotebookEditTool/NotebookEditTool.ts
 * 支持 replace/insert/delete 三种模式，遵循 nbformat 规范
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { ToolModule } from '../types'

export const notebookEditTool: ToolModule = {
  definition: {
    name: 'NotebookEdit',
    description:
      'Edit a Jupyter Notebook (.ipynb) cell. Supports replace, insert, and delete modes. Requires cell_id for replace/delete, cell_id and cell_type for insert.',
    input_schema: {
      type: 'object',
      properties: {
        notebook_path: { type: 'string', description: 'Absolute path to the .ipynb file' },
        cell_id: {
          type: 'string',
          description: 'Cell ID (or index as "cell-N") for replace/delete; insert position for insert',
        },
        cell_type: {
          type: 'string',
          enum: ['code', 'markdown', 'raw'],
          description: 'Cell type (required for insert mode)',
        },
        edit_mode: {
          type: 'string',
          enum: ['replace', 'insert', 'delete'],
          description: 'Edit mode (default: replace)',
        },
        new_source: { type: 'string', description: 'New cell source content' },
      },
      required: ['notebook_path', 'cell_id', 'new_source'],
    },
  },
  async execute(input) {
    const filePath = input.notebook_path as string
    const cellId = input.cell_id as string
    const mode = (input.edit_mode as string) || 'replace'
    const newSource = input.new_source as string
    const cellType = (input.cell_type as string) || 'code'

    if (!existsSync(filePath)) {
      return { content: `Error: Notebook not found: ${filePath}`, isError: true }
    }

    try {
      const nb = JSON.parse(readFileSync(filePath, 'utf-8'))
      const cells = nb.cells || []

      // 查找单元格：先按 ID 匹配，再按索引
      let cellIndex = -1
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].id === cellId || `cell-${i}` === cellId || String(i) === cellId) {
          cellIndex = i
          break
        }
      }

      if (mode === 'delete') {
        if (cellIndex === -1) {
          return { content: `Error: Cell "${cellId}" not found`, isError: true }
        }
        cells.splice(cellIndex, 1)
      } else if (mode === 'insert') {
        const newCell: any = {
          cell_type: cellType,
          source: newSource.split('\n').map((line, i, arr) => (i < arr.length - 1 ? line + '\n' : line)),
          metadata: {},
        }
        if (cellType === 'code') {
          newCell.execution_count = null
          newCell.outputs = []
        }
        // 生成 cell ID（nbformat >= 4.5）
        if (nb.nbformat >= 4 && (nb.nbformat > 4 || nb.nbformat_minor >= 5)) {
          newCell.id = `cell-${Date.now()}`
        }
        const insertAt = cellIndex === -1 ? cells.length : cellIndex
        cells.splice(insertAt, 0, newCell)
      } else {
        // replace
        if (cellIndex === -1) {
          return { content: `Error: Cell "${cellId}" not found`, isError: true }
        }
        cells[cellIndex].source = newSource.split('\n').map((line, i, arr) =>
          i < arr.length - 1 ? line + '\n' : line,
        )
        if (cells[cellIndex].cell_type === 'code') {
          cells[cellIndex].execution_count = null
          cells[cellIndex].outputs = []
        }
      }

      nb.cells = cells
      writeFileSync(filePath, JSON.stringify(nb, null, 1), 'utf-8')
      return {
        content: `Notebook edited: ${filePath} (${mode} cell "${cellId}")`,
        isError: false,
      }
    } catch (e: any) {
      return { content: `NotebookEdit error: ${e.message}`, isError: true }
    }
  },
}
