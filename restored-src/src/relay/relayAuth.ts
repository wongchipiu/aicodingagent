/**
 * Relay 认证 — CLI 向中继服务器注册获取 JWT
 */

import type { RelayClientConfig } from './relayConfig.js'
import type { CLIRegisterResponse, AuthErrorResponse } from '../../../../shared-types/src/index.js'

/** 向中继服务器注册，获取 JWT token */
export async function registerWithRelay(
  config: RelayClientConfig,
): Promise<{ success: true; token: string; clientId: string } | { success: false; error: string }> {
  const url = `${config.httpUrl}/api/cli/register`
  const body = JSON.stringify({
    relayKey: config.relayKey,
    machineId: config.machineId,
    version: config.version,
  })

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const data = (await resp.json()) as CLIRegisterResponse | AuthErrorResponse

    if (data.success) {
      return { success: true, token: data.token, clientId: data.clientId }
    }
    return { success: false, error: data.error }
  } catch (err) {
    return {
      success: false,
      error: `Failed to connect to relay server: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** 向中继服务器请求生成配对码（供 iPhone 配对） */
export async function generatePairCode(
  config: RelayClientConfig,
  token: string,
): Promise<{ success: true; pairCode: string } | { success: false; error: string }> {
  const url = `${config.httpUrl}/api/pair-code/generate`

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    const data = (await resp.json()) as
      | { success: true; pairCode: string }
      | { success: false; error: string }

    if (data.success) {
      return { success: true, pairCode: data.pairCode }
    }
    return { success: false, error: data.error }
  } catch (err) {
    return {
      success: false,
      error: `Failed to generate pair code: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** 创建新会话 */
export async function createRelaySession(
  config: RelayClientConfig,
  token: string,
  workDir: string,
): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {
  const url = `${config.httpUrl}/api/sessions`

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ workDir }),
    })

    const data = (await resp.json()) as
      | { success: true; sessionId: string }
      | { success: false; error: string }

    if (data.success) {
      return { success: true, sessionId: data.sessionId }
    }
    return { success: false, error: data.error }
  } catch (err) {
    return {
      success: false,
      error: `Failed to create session: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
