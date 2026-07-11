/**
 * Relay 权限桥 — 拦截本地权限请求，转发到 iPhone 审批
 *
 * 工作流程：
 * 1. Agent 执行工具需要权限时，调用 requestPermission()
 * 2. 权限请求通过 RelayConnector 发送到中继服务器
 * 3. 中继服务器转发给 iPhone
 * 4. iPhone 审批后返回结果
 * 5. RelayConnector 收到响应，resolve Promise
 */

import { randomUUID } from 'crypto'
import type { RelayConnector } from './relayConnector.js'
import type {
  PermissionRequest,
  PermissionResult,
} from '../../../../shared-types/src/index.js'

/** 权限请求超时时间（毫秒） */
const PERMISSION_TIMEOUT_MS = 120_000 // 2 分钟

/** 待处理权限请求的 Promise resolve 函数 */
type PendingResolver = (result: PermissionResult) => void

export class RelayPermissionBridge {
  /** requestId → resolver */
  private pending = new Map<string, PendingResolver>()

  constructor(private connector: RelayConnector) {
    // 注册控制响应处理器
    this.connector.onControlResponse = (msg) => {
      if (msg.response.subtype === 'success') {
        const resolver = this.pending.get(msg.response.request_id)
        if (resolver) {
          resolver(msg.response.response)
          this.pending.delete(msg.response.request_id)
        }
      }
    }
  }

  /**
   * 请求权限审批 — 拦截本地权限检查，转发到 iPhone
   * @returns 审批结果（allow/deny）
   */
  async requestPermission(
    sessionId: string,
    permission: Omit<PermissionRequest, 'subtype'>,
  ): Promise<PermissionResult> {
    const requestId = randomUUID()
    const fullRequest: PermissionRequest = {
      subtype: 'can_use_tool',
      ...permission,
    }

    // 创建 Promise，等待 iPhone 响应
    const responsePromise = new Promise<PermissionResult>((resolve) => {
      this.pending.set(requestId, resolve)
    })

    // 超时兜底：自动 deny
    const timeoutPromise = new Promise<PermissionResult>((resolve) => {
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId)
          resolve({
            behavior: 'deny',
            message: 'Permission request timeout: no response from iPhone within 2 minutes',
          })
        }
      }, PERMISSION_TIMEOUT_MS)
    })

    // 发送权限请求到中继服务器
    const sent = this.connector.sendControlRequest(sessionId, requestId, fullRequest)
    if (!sent) {
      this.pending.delete(requestId)
      return {
        behavior: 'deny',
        message: 'Failed to send permission request: relay connection not available',
      }
    }

    // 等待响应或超时
    return Promise.race([responsePromise, timeoutPromise])
  }

  /** 检查是否有待处理的权限请求 */
  hasPendingRequests(): boolean {
    return this.pending.size > 0
  }

  /** 获取待处理请求数量 */
  getPendingCount(): number {
    return this.pending.size
  }
}
