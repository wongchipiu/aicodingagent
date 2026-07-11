/**
 * 认证模块 — JWT 签发/验证 + 预共享密钥验证 + 配对码管理
 *
 * 完全自建，不依赖任何第三方 OAuth。
 */

import jwt from 'jsonwebtoken'
import { randomBytes, randomInt } from 'crypto'
import type { RelayConfig } from './config.js'
import type { PairCodeRecord, RelayState } from './types.js'
import type {
  AuthErrorResponse,
  CLIRegisterResponse,
  IPhonePairResponse,
  WSAuthPayload,
  WSRole,
} from '../../shared-types/src/index.js'

export class AuthService {
  constructor(
    private config: RelayConfig,
    private state: RelayState,
  ) {}

  // ==================== CLI 注册 ====================

  /** 验证 CLI 预共享密钥，签发 JWT */
  registerCLI(
    relayKey: string,
    machineId: string,
    _version?: string,
  ): CLIRegisterResponse | AuthErrorResponse {
    if (relayKey !== this.config.relayKey) {
      return { success: false, error: 'Invalid relay key', code: 'INVALID_KEY' }
    }

    const clientId = `cli-${machineId}-${randomBytes(4).toString('hex')}`
    const now = Math.floor(Date.now() / 1000)
    const exp = now + this.config.tokenTtlSec

    const payload: WSAuthPayload = {
      clientId,
      role: 'cli' as WSRole,
      deviceId: machineId,
      iat: now,
      exp,
    }

    const token = jwt.sign(payload, this.config.jwtSecret)
    return {
      success: true,
      token,
      clientId,
      expiresAt: exp * 1000,
    }
  }

  // ==================== iPhone 配对 ====================

  /** CLI 生成配对码（供 iPhone 扫码/手动输入） */
  generatePairCode(cliClientId: string, cliConnectionId: string): string {
    // 清理该 CLI 之前的旧配对码
    for (const [code, record] of this.state.pairCodes) {
      if (record.cliClientId === cliClientId) {
        this.state.pairCodes.delete(code)
      }
    }

    // 生成 6 位数字码
    const code = String(randomInt(0, 1000000)).padStart(6, '0')
    const now = Date.now()

    const record: PairCodeRecord = {
      code,
      cliClientId,
      cliConnectionId,
      createdAt: now,
      expiresAt: now + this.config.pairCodeTtlSec * 1000,
    }

    this.state.pairCodes.set(code, record)
    console.log(`[Auth] Pair code generated: ${code} (expires in ${this.config.pairCodeTtlSec}s)`)
    return code
  }

  /** iPhone 通过配对码获取 JWT */
  pairIPhone(
    pairCode: string,
    deviceUuid: string,
    deviceName: string,
  ): IPhonePairResponse | AuthErrorResponse {
    const record = this.state.pairCodes.get(pairCode)
    if (!record) {
      return { success: false, error: 'Invalid pair code', code: 'INVALID_PAIR_CODE' }
    }

    if (Date.now() > record.expiresAt) {
      this.state.pairCodes.delete(pairCode)
      return { success: false, error: 'Pair code expired', code: 'INVALID_PAIR_CODE' }
    }

    const clientId = `iphone-${deviceUuid}-${randomBytes(4).toString('hex')}`
    const now = Math.floor(Date.now() / 1000)
    const exp = now + this.config.tokenTtlSec

    const payload: WSAuthPayload = {
      clientId,
      role: 'iphone' as WSRole,
      deviceId: deviceUuid,
      iat: now,
      exp,
    }

    const token = jwt.sign(payload, this.config.jwtSecret)

    // 配对码一次性使用
    this.state.pairCodes.delete(pairCode)

    console.log(`[Auth] iPhone paired: ${deviceName} → CLI ${record.cliClientId}`)
    return {
      success: true,
      token,
      cliClientId: record.cliClientId,
      expiresAt: exp * 1000,
    }
  }

  // ==================== JWT 验证 ====================

  /** 验证 JWT token，返回 payload 或 null */
  verifyToken(token: string): WSAuthPayload | null {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as WSAuthPayload
      if (payload.exp * 1000 < Date.now()) {
        return null
      }
      return payload
    } catch {
      return null
    }
  }

  /** 从 HTTP Authorization 头中提取并验证 token */
  verifyBearerHeader(authHeader: string | undefined): WSAuthPayload | null {
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.slice(7)
    return this.verifyToken(token)
  }

  // ==================== 清理过期配对码 ====================

  cleanupExpiredPairCodes(): void {
    const now = Date.now()
    for (const [code, record] of this.state.pairCodes) {
      if (now > record.expiresAt) {
        this.state.pairCodes.delete(code)
      }
    }
  }
}
