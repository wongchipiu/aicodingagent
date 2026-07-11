/**
 * 中继服务器入口 — HTTP API + WebSocket Hub
 *
 * 启动方式: PA_RELAY_KEY=your-secret node --import tsx src/server.ts
 *
 * HTTP API:
 *   POST /api/cli/register      → CLI 注册，返回 JWT
 *   POST /api/iphone/pair        → iPhone 配对，返回 JWT
 *   GET  /api/sessions           → 获取会话列表（需 Bearer token）
 *   POST /api/sessions           → 创建新会话（需 Bearer token）
 *   POST /api/pair-code/generate → CLI 生成配对码（需 Bearer token）
 *
 * WebSocket:
 *   WS /ws?token=xxx             → 双向通信，token 中 role 决定身份
 */

import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { randomUUID } from 'crypto'
import { loadConfig } from './config.js'
import { AuthService } from './auth.js'
import { SessionStore } from './sessionStore.js'
import { MessageRouter } from './messageRouter.js'
import type { ActiveConnection, RelayState } from './types.js'

/** 从 WS 握手请求中提取 token */
function extractWsToken(headers: http.IncomingHttpHeaders): string | null {
  // 支持自定义 header: x-relay-token
  const xToken = headers['x-relay-token']
  if (typeof xToken === 'string') return xToken
  // 也支持标准 Authorization header
  const auth = headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7)
  }
  return null
}

async function main() {
  const config = loadConfig()
  const state: RelayState = {
    connections: new Map(),
    sessions: new Map(),
    clientIdToConnId: new Map(),
    pairCodes: new Map(),
  }

  const authService = new AuthService(config, state)
  const sessionStore = new SessionStore(config, state)
  const messageRouter = new MessageRouter(sessionStore, state)

  // ==================== HTTP Server ====================

  const app = express()
  app.use(express.json())

  if (config.enableCors) {
    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-relay-token')
      if (_req.method === 'OPTIONS') {
        return res.sendStatus(204)
      }
      next()
    })
  }

  // --- CLI 注册 ---
  app.post('/api/cli/register', (req, res) => {
    const { relayKey, machineId, version } = req.body ?? {}
    if (!relayKey || !machineId) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing relayKey or machineId', code: 'INVALID_KEY' })
    }
    const result = authService.registerCLI(relayKey, machineId, version)
    if (result.success) {
      res.json(result)
    } else {
      res.status(401).json(result)
    }
  })

  // --- iPhone 配对 ---
  app.post('/api/iphone/pair', (req, res) => {
    const { pairCode, deviceUuid, deviceName } = req.body ?? {}
    if (!pairCode || !deviceUuid) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing pairCode or deviceUuid', code: 'INVALID_PAIR_CODE' })
    }
    const result = authService.pairIPhone(pairCode, deviceUuid, deviceName ?? 'iPhone')
    if (result.success) {
      res.json(result)
    } else {
      res.status(401).json(result)
    }
  })

  // --- 生成配对码（CLI 调用） ---
  app.post('/api/pair-code/generate', (req, res) => {
    const auth = authService.verifyBearerHeader(req.headers.authorization)
    if (!auth || auth.role !== 'cli') {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
    }
    const connId = state.clientIdToConnId.get(auth.clientId) ?? ''
    const code = authService.generatePairCode(auth.clientId, connId)
    res.json({ success: true, pairCode: code })
  })

  // --- 会话列表 ---
  app.get('/api/sessions', (req, res) => {
    const auth = authService.verifyBearerHeader(req.headers.authorization)
    if (!auth) {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
    }
    res.json({ success: true, sessions: sessionStore.listSessions() })
  })

  // --- 创建会话 ---
  app.post('/api/sessions', (req, res) => {
    const auth = authService.verifyBearerHeader(req.headers.authorization)
    if (!auth || auth.role !== 'cli') {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
    }
    const connId = state.clientIdToConnId.get(auth.clientId)
    if (!connId) {
      return res.status(400).json({ success: false, error: 'CLI WS not connected' })
    }
    const { workDir } = req.body ?? {}
    const session = sessionStore.createSession(connId, workDir ?? process.cwd())
    res.json({ success: true, sessionId: session.sessionId })
  })

  // --- 健康检查 ---
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      connections: state.connections.size,
      sessions: state.sessions.size,
      uptime: process.uptime(),
    })
  })

  // ==================== HTTP + WS Server ====================

  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`)
    const token = url.searchParams.get('token') ?? extractWsToken(req.headers)

    const auth = authService.verifyToken(token)
    if (!auth) {
      ws.close(4001, 'Unauthorized')
      return
    }

    const connectionId = randomUUID()
    const conn: ActiveConnection = {
      ws,
      auth,
      role: auth.role,
      lastHeartbeat: Date.now(),
      sessionIds: new Set(),
    }

    sessionStore.registerConnection(connectionId, conn)

    ws.on('message', data => {
      const raw = typeof data === 'string' ? data : data.toString()
      messageRouter.handleMessage(connectionId, raw)
    })

    ws.on('close', () => {
      sessionStore.unregisterConnection(connectionId)
    })

    ws.on('error', err => {
      console.error(`[WS] Error on ${connectionId}:`, err.message)
    })

    // 发送连接确认
    ws.send(
      JSON.stringify({
        type: 'system',
        session_id: '',
        subtype: 'init',
        message: `Connected as ${auth.role} (${auth.clientId})`,
      }),
    )
  })

  // ==================== 心跳检测定时器 ====================

  setInterval(() => {
    const timedOut = sessionStore.checkHeartbeats()
    for (const connId of timedOut) {
      const conn = state.connections.get(connId)
      if (conn) {
        conn.ws.terminate()
        sessionStore.unregisterConnection(connId)
      }
    }
    // 清理过期配对码
    authService.cleanupExpiredPairCodes()
  }, config.heartbeatCheckIntervalSec * 1000)

  // ==================== 启动服务器 ====================

  server.listen(config.port, config.host, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║   Personal Agent Relay Server v1.0.0         ║
╠══════════════════════════════════════════════╣
║  HTTP:   http://${config.host}:${config.port}
║  WS:     ws://${config.host}:${config.port}/ws?token=<JWT>
║  Health: http://${config.host}:${config.port}/health
╠══════════════════════════════════════════════╣
║  Token TTL:     ${config.tokenTtlSec}s
║  Heartbeat:     ${config.heartbeatTimeoutSec}s timeout
║  Max Sessions:  ${config.maxSessions}
╚══════════════════════════════════════════════╝
    `)
  })

  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n[Relay] Shutting down...')
    for (const conn of state.connections.values()) {
      conn.ws.close(4000, 'Server shutting down')
    }
    server.close(() => {
      console.log('[Relay] Stopped.')
      process.exit(0)
    })
  })
}

main().catch(err => {
  console.error('[Relay] Fatal error:', err)
  process.exit(1)
})
