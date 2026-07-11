/**
 * Relay 端到端测试 — 验证三端协议正确性
 *
 * 测试流程：
 * 1. 验证 HTTP API（健康检查、注册、配对、会话）
 * 2. 验证 WebSocket 连接（认证拒绝、消息路由）
 * 3. 验证用户消息、权限请求、流式分块、权限响应等核心协议
 *
 * 运行: cd relay && npm run test:e2e
 */

import WebSocket from 'ws'

const RELAY_URL = process.env.RELAY_URL ?? 'http://localhost:7780'
const WS_URL = RELAY_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws'
const TEST_KEY = process.env.PA_RELAY_KEY ?? 'e2e-test-key'

interface TestResult { name: string; passed: boolean; error?: string }
const results: TestResult[] = []

function logResult(name: string, passed: boolean, error?: string) {
  results.push({ name, passed, error })
  console.log(`  ${passed ? '\u2713' : '\u2717'} ${name}${error ? ` — ${error}` : ''}`)
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); logResult(name, true) }
  catch (err) { logResult(name, false, err instanceof Error ? err.message : String(err)) }
}

async function fetchJSON(path: string, options: RequestInit = {}): Promise<any> {
  const resp = await fetch(`${RELAY_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })
  return resp.json()
}

async function main() {
  console.log('\n\u{1F9EA} Personal Agent Relay — End-to-End Test\n')
  console.log(`Relay URL: ${RELAY_URL}\n`)

  // ==================== HTTP API 测试 ====================
  console.log('--- HTTP API ---\n')

  await test('Health check', async () => {
    const data = await fetchJSON('/health')
    if (data.status !== 'ok') throw new Error(`Expected status:ok, got ${data.status}`)
  })

  await test('CLI register rejects invalid key', async () => {
    const data = await fetchJSON('/api/cli/register', {
      method: 'POST',
      body: JSON.stringify({ relayKey: 'wrong-key', machineId: 'e2e-pc' }),
    })
    if (data.success) throw new Error('Should reject invalid key')
    if (data.code !== 'INVALID_KEY') throw new Error(`Expected INVALID_KEY, got ${data.code}`)
  })

  let cliToken = '', cliClientId = ''
  await test('CLI register accepts valid key', async () => {
    const data = await fetchJSON('/api/cli/register', {
      method: 'POST',
      body: JSON.stringify({ relayKey: TEST_KEY, machineId: 'e2e-pc' }),
    })
    if (!data.success) throw new Error('Should succeed with valid key')
    cliToken = data.token
    cliClientId = data.clientId
    if (!cliToken.startsWith('eyJ')) throw new Error('Should return JWT')
  })

  // 先连接 CLI WebSocket，sessionStore 需要 CLI 连接存在才能创建 session
  let cliWsEarly: WebSocket | null = new WebSocket(`${WS_URL}?token=${cliToken}`)
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 5000)
    cliWsEarly!.on('open', () => { clearTimeout(t); resolve() })
    cliWsEarly!.on('error', (e) => { clearTimeout(t); reject(e) })
  })

  let pairCode = ''
  await test('Generate pair code', async () => {
    const data = await fetchJSON('/api/pair-code/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cliToken}` },
    })
    if (!data.success) throw new Error('Should succeed')
    pairCode = data.pairCode
    if (!/^\d{6}$/.test(pairCode)) throw new Error('Should be 6-digit code')
  })

  let iphoneToken = ''
  await test('iPhone pair with valid code', async () => {
    const data = await fetchJSON('/api/iphone/pair', {
      method: 'POST',
      body: JSON.stringify({ pairCode, deviceUuid: 'e2e-iphone-001', deviceName: 'E2E iPhone' }),
    })
    if (!data.success) throw new Error('Should succeed')
    iphoneToken = data.token
    if (data.cliClientId !== cliClientId) throw new Error('Should bind to same CLI')
  })

  await test('iPhone pair rejects invalid code', async () => {
    const data = await fetchJSON('/api/iphone/pair', {
      method: 'POST',
      body: JSON.stringify({ pairCode: '000000', deviceUuid: 'e2e-iphone-002' }),
    })
    if (data.success) throw new Error('Should reject invalid code')
  })

  let sessionId = ''
  await test('Create session', async () => {
    const data = await fetchJSON('/api/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cliToken}` },
      body: JSON.stringify({ workDir: '/tmp/e2e' }),
    })
    if (!data.success) throw new Error('Should succeed')
    sessionId = data.sessionId
  })

  // ==================== WebSocket 测试 ====================
  console.log('\n--- WebSocket ---\n')

  let cliWs: WebSocket | null = cliWsEarly
  let iphoneWs: WebSocket | null = null

  await test('CLI WebSocket connects', async () => {
    // cliWs 已经在上面创建
    if (cliWs!.readyState !== WebSocket.OPEN) {
      throw new Error('CLI WebSocket not open')
    }
  })

  await test('iPhone WebSocket connects', async () => {
    iphoneWs = new WebSocket(`${WS_URL}?token=${iphoneToken}`)
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 5000)
      iphoneWs!.on('open', () => { clearTimeout(t); resolve() })
      iphoneWs!.on('error', (e) => { clearTimeout(t); reject(e) })
    })
  })

  await test('WebSocket rejects unauthorized', async () => {
    const badWs = new WebSocket(WS_URL)
    let closed = false
    badWs.on('close', () => { closed = true })
    await new Promise((r) => setTimeout(r, 500))
    badWs.close()
    if (!closed) throw new Error('Should close unauthorized connection')
  })

  await test('User message routes iPhone -> CLI', async () => {
    const received: any[] = []
    cliWs!.on('message', (d) => received.push(JSON.parse(d.toString())))
    iphoneWs!.send(JSON.stringify({
      type: 'user', session_id: sessionId,
      message: { role: 'user', content: 'Hello from iPhone' },
      parent_tool_use_id: null,
    }))
    await new Promise((r) => setTimeout(r, 500))
    if (!received.find((m) => m.message?.content === 'Hello from iPhone')) {
      throw new Error('CLI did not receive iPhone message')
    }
  })

  await test('Permission request routes CLI -> iPhone', async () => {
    const received: any[] = []
    iphoneWs!.on('message', (d) => received.push(JSON.parse(d.toString())))
    cliWs!.send(JSON.stringify({
      type: 'control_request', request_id: 'req-001', session_id: sessionId,
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' }, tool_use_id: 'tool-001' },
    }))
    await new Promise((r) => setTimeout(r, 500))
    if (!received.find((m) => m.type === 'control_request' && m.request_id === 'req-001')) {
      throw new Error('iPhone did not receive permission request')
    }
  })

  await test('Permission response routes iPhone -> CLI', async () => {
    const received: any[] = []
    cliWs!.on('message', (d) => received.push(JSON.parse(d.toString())))
    iphoneWs!.send(JSON.stringify({
      type: 'control_response', session_id: sessionId,
      response: { subtype: 'success', request_id: 'req-001', response: { behavior: 'allow' } },
    }))
    await new Promise((r) => setTimeout(r, 500))
    if (!received.find((m) => m.type === 'control_response' && m.response?.request_id === 'req-001')) {
      throw new Error('CLI did not receive permission response')
    }
  })

  await test('Assistant chunk routes CLI -> iPhone', async () => {
    const received: any[] = []
    iphoneWs!.on('message', (d) => received.push(JSON.parse(d.toString())))
    cliWs!.send(JSON.stringify({
      type: 'assistant_chunk', session_id: sessionId, content: 'Hi!', is_final: false,
    }))
    await new Promise((r) => setTimeout(r, 500))
    if (!received.find((m) => m.content === 'Hi!')) {
      throw new Error('iPhone did not receive assistant chunk')
    }
  })

  await test('Heartbeat handshake', async () => {
    let ackReceived = false
    cliWs!.on('message', (d) => {
      const m = JSON.parse(d.toString())
      if (m.type === 'heartbeat_ack') ackReceived = true
    })
    cliWs!.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }))
    await new Promise((r) => setTimeout(r, 500))
    if (!ackReceived) throw new Error('No heartbeat_ack received')
  })

  // 清理
  cliWs?.close()
  iphoneWs?.close()

  // ==================== 总结 ====================
  console.log('\n--- Results ---\n')
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`)

  if (failed > 0) {
    console.log('Failed tests:')
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.name}: ${r.error}`))
    process.exit(1)
  } else {
    console.log('\u2705 All tests passed!\n')
    process.exit(0)
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
