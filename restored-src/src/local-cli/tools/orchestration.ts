/**
 * 编排与交互工具：TodoWrite / AskUserQuestion / Agent / ScheduleCron
 *
 * 参考: restored-src/src/tools/TodoWriteTool、AskUserQuestionTool、AgentTool、ScheduleCronTool
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import type { ToolModule, ToolContext, TodoItem } from '../types'

export const todoWriteTool: ToolModule = {
  definition: {
    name: 'TodoWrite',
    description:
      'Create or update a task checklist to track multi-step work. Use this for complex tasks that require tracking progress across multiple steps. Always set one task to in_progress when actively working on it.',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The full todo list (replaces existing list)',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Description of the task' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Current status of the task',
              },
              activeForm: {
                type: 'string',
                description: 'Present-tense description when in_progress (optional)',
              },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
  },
  async execute(input, ctx) {
    const todos = input.todos as TodoItem[]
    ctx.todos.length = 0
    ctx.todos.push(...todos)
    // 持久化到工作目录
    const todoPath = join(ctx.workDir, '.agent-todos.json')
    try {
      writeFileSync(todoPath, JSON.stringify(todos, null, 2), 'utf-8')
    } catch {
      // 持久化失败不阻塞功能
    }
    const summary = todos
      .map((t, i) => {
        const mark =
          t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]'
        return `${i + 1}. ${mark} ${t.content}`
      })
      .join('\n')
    return {
      content: `Todo list updated (${todos.length} items):\n${summary}`,
      isError: false,
    }
  },
}

export const askUserQuestionTool: ToolModule = {
  definition: {
    name: 'AskUserQuestion',
    description:
      'Ask the user a clarifying question when requirements are ambiguous. The user will respond via the terminal. Use sparingly—only when you cannot reasonably proceed without clarification.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the user' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of choices for the user to pick from',
        },
      },
      required: ['question'],
    },
  },
  async execute(input, ctx) {
    const question = input.question as string
    const options = input.options as string[] | undefined
    let prompt = `\n  [QUESTION] ${question}\n`
    if (options && options.length > 0) {
      options.forEach((opt, i) => {
        prompt += `    ${i + 1}. ${opt}\n`
      })
      prompt += `  Enter your choice (number or type your own answer): `
    } else {
      prompt += `  > `
    }
    const answer = await ctx.askUser(prompt)
    return { content: `User answered: ${answer}`, isError: false }
  },
}

export const agentTool: ToolModule = {
  definition: {
    name: 'Agent',
    description:
      'Delegate a sub-task to an autonomous sub-agent. The sub-agent runs independently with its own conversation context and a subset of tools, then returns its result. Use for parallelizable or isolated sub-tasks. Do NOT use for trivial tasks.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'A clear, self-contained description of the task for the sub-agent',
        },
        max_turns: {
          type: 'number',
          description: 'Maximum turns for the sub-agent (default: 10)',
        },
      },
      required: ['prompt'],
    },
  },
  async execute(input, ctx) {
    const prompt = input.prompt as string
    const maxTurns = (input.max_turns as number) || 10
    console.log(`\n  [Agent] Launching sub-agent for: ${prompt.slice(0, 100)}...`)
    try {
      const result = await ctx.runSubAgent(prompt, maxTurns)
      return { content: result, isError: false }
    } catch (e: any) {
      return { content: `Sub-agent failed: ${e.message}`, isError: true }
    }
  },
}

export const scheduleCronTool: ToolModule = {
  definition: {
    name: 'ScheduleCron',
    description:
      'Schedule a recurring reminder or task within this CLI session. Uses an interval in seconds. The reminder prints to the terminal at each interval. Tasks are cleared when the session ends.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'cancel'],
          description: 'Action to perform',
        },
        interval_seconds: {
          type: 'number',
          description: 'Interval in seconds (for create action). Minimum 5.',
        },
        id: {
          type: 'string',
          description: 'Task ID (for cancel) or custom ID (for create, auto-generated if omitted)',
        },
        prompt: {
          type: 'string',
          description: 'The reminder message or task description (for create)',
        },
      },
      required: ['action'],
    },
  },
  async execute(input, ctx) {
    const action = input.action as string

    if (action === 'list') {
      if (ctx.scheduledTasks.size === 0) {
        return { content: 'No scheduled tasks.', isError: false }
      }
      const list = Array.from(ctx.scheduledTasks.values())
        .map(
          (t) =>
            `- ${t.id}: every ${t.intervalMs / 1000}s, run ${t.runCount}x — "${t.prompt.slice(0, 60)}"`,
        )
        .join('\n')
      return { content: list, isError: false }
    }

    if (action === 'cancel') {
      const id = input.id as string
      const task = ctx.scheduledTasks.get(id)
      if (!task) {
        return { content: `No task with id "${id}"`, isError: true }
      }
      clearInterval(task.timer)
      ctx.scheduledTasks.delete(id)
      return { content: `Cancelled task "${id}"`, isError: false }
    }

    if (action === 'create') {
      const intervalSeconds = input.interval_seconds as number
      const prompt = input.prompt as string
      if (!intervalSeconds || intervalSeconds < 5) {
        return { content: 'interval_seconds must be >= 5', isError: true }
      }
      if (!prompt) {
        return { content: 'prompt is required for create', isError: true }
      }
      const id = (input.id as string) || `task-${Date.now()}`
      const intervalMs = intervalSeconds * 1000
      const task = {
        id,
        expression: `every ${intervalSeconds}s`,
        prompt,
        intervalMs,
        runCount: 0,
        timer: setInterval(() => {
          const t = ctx.scheduledTasks.get(id)
          if (t) {
            t.runCount++
            t.lastRun = Date.now()
          }
          console.log(`\n  [SCHEDULED: ${id}] ${prompt}\n  > `)
        }, intervalMs) as NodeJS.Timeout,
      }
      ctx.scheduledTasks.set(id, task)
      return {
        content: `Scheduled task "${id}": every ${intervalSeconds}s — "${prompt}"`,
        isError: false,
      }
    }

    return { content: `Unknown action: ${action}`, isError: true }
  },
}
