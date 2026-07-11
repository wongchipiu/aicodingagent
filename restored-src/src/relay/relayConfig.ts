/**
 * Relay 配置 — 从环境变量读取中继服务器配置
 *
 * 环境变量:
 *   PA_RELAY_URL   — 中继服务器地址，如 ws://192.168.1.100:7780/ws
 *   PA_RELAY_KEY   — 预共享密钥（与中继服务器一致）
 */

import { hostname } from 'os'
import { createHash } from 'crypto'

export interface RelayClientConfig {
  /** 中继服务器 HTTP 基地址，如 http://192.168.1.100:7780 */
  httpUrl: string
  /** 中继服务器 WebSocket 地址，如 ws://192.168.1.100:7780/ws */
  wsUrl: string
  /** 预共享密钥 */
  relayKey: string
  /** CLI 机器标识 */
  machineId: string
  /** CLI 版本 */
  version: string
}

/** 从环境变量加载配置 */
export function loadRelayClientConfig(): RelayClientConfig | null {
  const relayUrl = process.env.PA_RELAY_URL
  const relayKey = process.env.PA_RELAY_KEY

  if (!relayUrl || !relayKey) {
    return null
  }

  // 将 HTTP URL 转为 WebSocket URL
  let httpUrl = relayUrl
  let wsUrl: string

  if (relayUrl.startsWith('ws://')) {
    wsUrl = relayUrl
    httpUrl = relayUrl.replace('ws://', 'http://')
  } else if (relayUrl.startsWith('wss://')) {
    wsUrl = relayUrl
    httpUrl = relayUrl.replace('wss://', 'https://')
  } else if (relayUrl.startsWith('http://')) {
    httpUrl = relayUrl
    wsUrl = relayUrl.replace('http://', 'ws://') + '/ws'
  } else if (relayUrl.startsWith('https://')) {
    httpUrl = relayUrl
    wsUrl = relayUrl.replace('https://', 'wss://') + '/ws'
  } else {
    // 默认 HTTP
    httpUrl = `http://${relayUrl}`
    wsUrl = `ws://${relayUrl}/ws`
  }

  // 确保 wsUrl 以 /ws 结尾
  if (!wsUrl.endsWith('/ws')) {
    wsUrl = wsUrl.replace(/\/$/, '') + '/ws'
  }

  return {
    httpUrl,
    wsUrl,
    relayKey,
    machineId: generateMachineId(),
    version: '1.0.0',
  }
}

/** 生成稳定的机器标识（hostname + hash） */
function generateMachineId(): string {
  const name = hostname()
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 8)
  return `${name}-${hash}`
}
