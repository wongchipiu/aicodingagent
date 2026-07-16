/**
 * Sleep 工具 — 延时等待（轮询场景）
 */
import type { ToolModule } from '../types'

export const sleepTool: ToolModule = {
  definition: {
    name: 'Sleep',
    description:
      'Pause execution for a specified number of seconds. Use when polling for a condition or waiting between retries.',
    input_schema: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'Number of seconds to sleep (max 60)',
        },
      },
      required: ['seconds'],
    },
  },
  async execute(input) {
    const seconds = input.seconds as number
    if (seconds > 60) {
      return { content: 'Error: Maximum sleep time is 60 seconds', isError: true }
    }
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
    return { content: `Slept for ${seconds}s`, isError: false }
  },
}
