/**
 * relayCanUseTool — 包装 canUseTool 回调，将权限请求转发到 iPhone
 *
 * 1. 先调用原始 canUseTool（检查本地权限规则）
 * 2. allow → 直接通过
 * 3. deny → 直接拒绝
 * 4. ask → 转发到 iPhone 审批
 */

import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type {
  PermissionAllowDecision,
  PermissionDenyDecision,
  PermissionDecision,
} from '../types/permissions.js'
import type { Tool as ToolType, ToolUseContext } from '../Tool.js'
import type { AssistantMessage } from '../types/message.js'
import type { RelaySessionManager } from './relaySessionManager.js'

export function createRelayCanUseTool(
  originalCanUseTool: CanUseToolFn,
  sessionManager: RelaySessionManager,
): CanUseToolFn {
  return async (
    tool: ToolType,
    input: Record<string, unknown>,
    toolUseContext: ToolUseContext,
    assistantMessage: AssistantMessage,
    toolUseID: string,
    forceDecision?: PermissionDecision,
  ): Promise<PermissionDecision> => {
    if (forceDecision) {
      return originalCanUseTool(tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision)
    }

    const localDecision = await originalCanUseTool(
      tool, input, toolUseContext, assistantMessage, toolUseID,
    )

    if (localDecision.behavior === 'allow') {
      return localDecision as PermissionAllowDecision
    }

    if (localDecision.behavior === 'deny') {
      return localDecision as PermissionDenyDecision
    }

    // 'ask' -> 转发到 iPhone
    const sessionId = sessionManager.getSessionId()
    const permissionBridge = sessionManager.getPermissionBridge()

    console.log(`[RelayPermission] Forwarding to iPhone: ${tool.name} (id=${toolUseID})`)

    const result = await permissionBridge.requestPermission(sessionId, {
      tool_name: tool.name,
      input,
      tool_use_id: toolUseID,
    })

    if (result.behavior === 'allow') {
      return {
        behavior: 'allow',
        updatedInput: result.updatedInput as Record<string, unknown> | undefined,
        decisionReason: {
          type: 'rule',
          rule: { behavior: 'allow', source: 'user' },
        },
        toolUseID,
      } as PermissionAllowDecision
    }

    return {
      behavior: 'deny',
      message: result.message ?? 'Denied by iPhone user',
      decisionReason: {
        type: 'rule',
        rule: { behavior: 'deny', source: 'user' },
      },
    } as PermissionDenyDecision
  }
}
