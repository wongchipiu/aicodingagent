/**
 * 中继服务器配置
 *
 * 所有配置通过环境变量读取，不依赖任何远程配置服务。
 */

export interface RelayConfig {
  /** HTTP 监听端口 */
  port: number
  /** 监听地址，'0.0.0.0' 允许外部访问 */
  host: string
  /** 预共享密钥（PA_RELAY_KEY），CLI 和 iPhone 必须使用相同密钥 */
  relayKey: string
  /** JWT 签名密钥（自动从 relayKey 派生） */
  jwtSecret: string
  /** JWT Token 有效期（秒） */
  tokenTtlSec: number
  /** 心跳超时（秒），超过此时间无心跳则标记断线 */
  heartbeatTimeoutSec: number
  /** 心跳检测间隔（秒） */
  heartbeatCheckIntervalSec: number
  /** 配对码有效期（秒） */
  pairCodeTtlSec: number
  /** 最大会话数 */
  maxSessions: number
  /** 是否启用 CORS（开发模式） */
  enableCors: boolean
}

function requiredEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback
  if (!val) {
    console.error(`[Relay] Missing required env: ${key}`)
    process.exit(1)
  }
  return val
}

function numEnv(key: string, fallback: number): number {
  const val = process.env[key]
  if (!val) return fallback
  const n = parseInt(val, 10)
  return isNaN(n) ? fallback : n
}

function boolEnv(key: string, fallback: boolean): boolean {
  const val = process.env[key]
  if (val === undefined) return fallback
  return val === 'true' || val === '1'
}

/** 从环境变量加载配置 */
export function loadConfig(): RelayConfig {
  const relayKey = requiredEnv('PA_RELAY_KEY', 'personal-agent-default-key-change-me')

  return {
    port: numEnv('PA_RELAY_PORT', 7780),
    host: process.env.PA_RELAY_HOST ?? '0.0.0.0',
    relayKey,
    // JWT secret 派生自 relayKey，加前缀防止与 relayKey 相同
    jwtSecret: `pa-relay-jwt-${relayKey}`,
    tokenTtlSec: numEnv('PA_TOKEN_TTL_SEC', 86400), // 24h
    heartbeatTimeoutSec: numEnv('PA_HEARTBEAT_TIMEOUT_SEC', 90),
    heartbeatCheckIntervalSec: numEnv('PA_HEARTBEAT_CHECK_INTERVAL_SEC', 30),
    pairCodeTtlSec: numEnv('PA_PAIR_CODE_TTL_SEC', 300), // 5min
    maxSessions: numEnv('PA_MAX_SESSIONS', 10),
    enableCors: boolEnv('PA_ENABLE_CORS', true),
  }
}
