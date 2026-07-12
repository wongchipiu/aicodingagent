export type ConnectorTextBlock = { type: 'connector_text'; connector_text: string }
export function isConnectorTextBlock(_block: unknown): _block is ConnectorTextBlock { return false }
