/**
 * remote-relay 命令处理器
 *
 * 用法：
 *   pa remote-relay                # 连接中继服务器，启动会话
 *   pa remote-relay --pair         # 生成配对码供 iPhone 配对
 *
 * 环境变量：
 *   PA_RELAY_URL  — 中继服务器地址（如 http://192.168.1.100:7780）
 *   PA_RELAY_KEY  — 预共享密钥
 */

import { setRelayConfig } from '../bootstrap/state.js'
import {
  loadRelayClientConfig,
  registerWithRelay,
  generatePairCode,
  createRelaySession,
  RelayConnector,
  RelayPermissionBridge,
  RelaySessionManager,
} from '../relay/index.js'

interface RemoteRelayOptions {
  pair?: boolean
  workDir: string
}

export async function remoteRelayHandler(opts: RemoteRelayOptions): Promise<void> {
  // 1. 加载配置
  const config = loadRelayClientConfig()
  if (!config) {
    console.error(
      '\n❌ Relay configuration not found.\n\n' +
        'Please set the following environment variables:\n' +
        '  PA_RELAY_URL  — Relay server URL (e.g. http://192.168.1.100:7780)\n' +
        '  PA_RELAY_KEY  — Pre-shared secret key\n\n' +
        'Example:\n' +
        '  export PA_RELAY_URL=http://your-server:7780\n' +
        '  export PA_RELAY_KEY=your-secret-key\n' +
        '  pa remote-relay\n',
    )
    process.exit(1)
  }

  console.log(`\n🔌 Connecting to relay server: ${config.httpUrl}`)

  // 2. 注册获取 JWT
  const regResult = await registerWithRelay(config)
  if (!regResult.success) {
    console.error(`\n❌ Failed to register with relay server: ${regResult.error}`)
    process.exit(1)
  }

  console.log(`✅ Registered. Client ID: ${regResult.clientId}`)

  // 保存到全局状态
  setRelayConfig({
    relayUrl: config.httpUrl,
    relayKey: config.relayKey,
    token: regResult.token,
    clientId: regResult.clientId,
    enabled: true,
  })

  // 3. 如果是 --pair 模式，生成配对码
  if (opts.pair) {
    const pairResult = await generatePairCode(config, regResult.token)
    if (!pairResult.success) {
      console.error(`\n❌ Failed to generate pair code: ${pairResult.error}`)
      process.exit(1)
    }

    console.log('\n📱 iPhone Pairing Code:')
    console.log(`   ┌─────────────┐`)
    console.log(`   │  ${pairResult.pairCode}  │`)
    console.log(`   └─────────────┘`)
    console.log(`\n   Open your iPhone App and enter this code to pair.`)
    console.log(`   The code expires in 5 minutes.\n`)
    console.log(`   Waiting for iPhone to connect...`)
    console.log(`   Press Ctrl+C to cancel.\n`)
  }

  // 4. 创建会话
  const sessionResult = await createRelaySession(config, regResult.token, opts.workDir)
  if (!sessionResult.success) {
    console.error(`\n❌ Failed to create session: ${sessionResult.error}`)
    process.exit(1)
  }

  console.log(`✅ Session created: ${sessionResult.sessionId}`)
  console.log(`📁 Work directory: ${opts.workDir}`)

  // 5. 建立 WebSocket 连接 + 创建 SessionManager
  let sessionManager: RelaySessionManager | null = null

  const connector = new RelayConnector(config.wsUrl, regResult.token, {
    onUserMessage: (msg) => {
      const content =
        typeof msg.message.content === 'string'
          ? msg.message.content
          : JSON.stringify(msg.message.content)
      console.log(`\n📱 [iPhone] ${content.slice(0, 200)}`)

      // 注入消息到 Agent 处理队列
      if (sessionManager) {
        sessionManager.handleUserMessage(msg)
      }
    },
    onInterrupt: (interruptSessionId) => {
      console.log(`\n⏹️ [iPhone] Interrupt requested for session ${interruptSessionId}`)
      if (sessionManager) {
        sessionManager.handleInterrupt(interruptSessionId)
      }
    },
    onConnected: () => {
      console.log('🔗 Relay connection established. iPhone can now connect.')
    },
    onDisconnected: () => {
      console.log('⚠️ Relay connection lost. Reconnecting...')
    },
    onError: (err) => {
      console.error(`❌ Relay error: ${err.message}`)
    },
  })

  // 创建权限桥
  const permissionBridge = new RelayPermissionBridge(connector)

  // 创建 SessionManager — 整合 RelayConnector + 权限桥 + 消息队列
  sessionManager = new RelaySessionManager(
    sessionResult.sessionId,
    connector,
    permissionBridge,
  )

  // 6. 启动连接
  connector.connect()

  // 7. 等待退出
  console.log('\n🚀 Personal Agent relay is running.')
  console.log('   Send messages from your iPhone app.')
  console.log('   Press Ctrl+C to stop.\n')

  // 保持进程运行
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down relay connector...')
    connector.disconnect()
    setTimeout(() => process.exit(0), 500)
  })

  // 保持进程存活
  return new Promise<void>(() => {})
}
