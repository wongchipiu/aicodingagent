# Personal Agent Relay Server

中继服务器 — 桥接 CLI 和 iPhone 的 WebSocket 连接，自建认证与消息路由。

## 快速启动

### 方式 1: 直接运行

```bash
cd relay
npm install
PA_RELAY_KEY=your-secret-key npm start
```

### 方式 2: Docker

```bash
# 构建镜像
docker build -t pa-relay -f relay/Dockerfile .

# 运行
docker run -d --name pa-relay \
  -p 7780:7780 \
  -e PA_RELAY_KEY=your-secret-key \
  pa-relay
```

### 方式 3: Docker Compose

```yaml
services:
  relay:
    build:
      context: .
      dockerfile: relay/Dockerfile
    ports:
      - "7780:7780"
    environment:
      - PA_RELAY_KEY=your-secret-key
      - PA_RELAY_PORT=7780
      - PA_RELAY_HOST=0.0.0.0
    restart: unless-stopped
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PA_RELAY_KEY` | (必填) | 预共享密钥，CLI 和 iPhone 必须相同 |
| `PA_RELAY_PORT` | 7780 | HTTP 监听端口 |
| `PA_RELAY_HOST` | 0.0.0.0 | 监听地址 |
| `PA_TOKEN_TTL_SEC` | 86400 | JWT 有效期（秒），默认 24h |
| `PA_HEARTBEAT_TIMEOUT_SEC` | 90 | 心跳超时（秒） |
| `PA_HEARTBEAT_CHECK_INTERVAL_SEC` | 30 | 心跳检测间隔（秒） |
| `PA_PAIR_CODE_TTL_SEC` | 300 | 配对码有效期（秒），默认 5min |
| `PA_MAX_SESSIONS` | 10 | 最大会话数 |
| `PA_ENABLE_CORS` | true | 是否启用 CORS |

## API 接口

### CLI 注册

```
POST /api/cli/register
Content-Type: application/json

{
  "relayKey": "your-secret-key",
  "machineId": "my-pc-abc123",
  "version": "1.0.0"
}

→ 200: { "success": true, "token": "<JWT>", "clientId": "cli-...", "expiresAt": 1234567890000 }
→ 401: { "success": false, "error": "Invalid relay key", "code": "INVALID_KEY" }
```

### 生成配对码（CLI 调用）

```
POST /api/pair-code/generate
Authorization: Bearer <JWT>

→ 200: { "success": true, "pairCode": "123456" }
```

### iPhone 配对

```
POST /api/iphone/pair
Content-Type: application/json

{
  "pairCode": "123456",
  "deviceUuid": "iphone-uuid-xxx",
  "deviceName": "Bruce's iPhone"
}

→ 200: { "success": true, "token": "<JWT>", "cliClientId": "cli-...", "expiresAt": 1234567890000 }
→ 401: { "success": false, "error": "Invalid pair code", "code": "INVALID_PAIR_CODE" }
```

### 会话列表

```
GET /api/sessions
Authorization: Bearer <JWT>

→ 200: { "success": true, "sessions": [...] }
```

### 创建会话

```
POST /api/sessions
Authorization: Bearer <JWT>
Content-Type: application/json

{ "workDir": "/home/user/project" }

→ 200: { "success": true, "sessionId": "uuid-xxx" }
```

### WebSocket 连接

```
WS /ws?token=<JWT>
```

连接后可发送/接收 `AgentMessage` 格式的 JSON 消息。

## 健康检查

```
GET /health

→ { "status": "ok", "connections": 2, "sessions": 1, "uptime": 3600 }
```

## 架构

```
┌─────────┐         ┌─────────────┐         ┌──────────┐
│  CLI PC  │◄──WS──►│  Relay Server│◄──WS──►│  iPhone  │
│ (Agent)  │         │  (Node.js)   │         │ (SwiftUI)│
└─────────┘         └─────────────┘         └──────────┘
```

中继服务器不感知 CLI 使用的 LLM（OpenAI/Ollama/DeepSeek 等），仅负责消息路由。
