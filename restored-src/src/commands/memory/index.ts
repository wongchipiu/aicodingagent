import type { Command } from '../../commands.js'

const memory: Command = {
  type: 'local-jsx',
  name: 'memory',
  description: 'Edit SmartAgent memory files',
  load: () => import('./memory.js'),
}

export default memory
