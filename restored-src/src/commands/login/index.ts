import type { Command } from '../../commands.js'
import { hashbruceApiKeyAuth } from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

export default () =>
  ({
    type: 'local-jsx',
    name: 'login',
    description: hashbruceApiKeyAuth()
      ? 'Switch hbruce accounts'
      : 'Sign in with your hbruce account',
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
    load: () => import('./login.js'),
  }) satisfies Command
