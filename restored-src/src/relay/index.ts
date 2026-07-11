/**
 * Relay 模块入口 — 导出所有 CLI 端中继连接组件
 */

export { RelayConnector } from './relayConnector.js'
export type { RelayConnectorCallbacks } from './relayConnector.js'
export { RelayPermissionBridge } from './relayPermissionBridge.js'
export { RelaySessionManager } from './relaySessionManager.js'
export { createRelayCanUseTool } from './relayCanUseTool.js'
export { loadRelayClientConfig } from './relayConfig.js'
export type { RelayClientConfig } from './relayConfig.js'
export { registerWithRelay, generatePairCode, createRelaySession } from './relayAuth.js'
