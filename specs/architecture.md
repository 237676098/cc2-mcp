# 整体架构

## 通信链路

```
AI 助手 ←→ [STDIO/JSON-RPC] ←→ MCP Server (Node.js) ←→ [WebSocket:9531] ←→ CC 编辑器扩展
```

- MCP Server：`src/` 目录，TypeScript ESM，通过 `@modelcontextprotocol/sdk` 暴露工具和资源
- CC 扩展：`cc-extension/` 目录，CommonJS 纯 JS，运行在 CC 编辑器主进程

## Bridge 协议

WebSocket 连接地址：`ws://127.0.0.1:9531`

### 请求格式

```json
{
  "id": "uuid-v4",
  "type": "request",
  "domain": "scene | asset | project | editor",
  "method": "methodName",
  "params": {}
}
```

### 响应格式

```json
{
  "id": "对应请求id",
  "type": "response",
  "success": true,
  "data": {},
  "error": { "code": "ERROR_CODE", "message": "描述" }
}
```

### 可靠性机制

- **心跳**：每 15s 发送 WebSocket ping
- **自动重连**：指数退避 1s → 30s
- **请求超时**：默认 30s，构建操作 120s
- **断连处理**：`rejectAll()` 拒绝所有等待中的请求

## 四个域 (Domain)

| 域 | 运行环境 | 职责 |
|----|----------|------|
| `scene` | 场景渲染进程 (scene-walker.js) | 节点树、组件、场景序列化。通过 `Editor.Scene.callSceneScript()` 调用 |
| `asset` | 编辑器主进程 | 资源数据库查询（queryAssets 等） |
| `project` | 编辑器主进程 | 项目信息、场景/脚本列表、读写脚本文件、项目设置 |
| `editor` | 编辑器主进程 | 控制台日志、选中状态、构建、预览、打开/保存场景 |

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/index.ts` | MCP Server 入口，创建 STDIO transport |
| `src/server.ts` | 创建 McpServer，注册工具与资源 |
| `src/bridge/client.ts` | WebSocket 客户端，自动重连 + 心跳 |
| `src/bridge/queue.ts` | UUID 请求关联队列，超时管理 |
| `src/bridge/protocol.ts` | 协议类型定义与常量 |
| `cc-extension/main.js` | WS 服务端，域路由，资源/项目/编辑器操作 |
| `cc-extension/scene-walker.js` | 场景渲染进程，节点/组件操作 |
| `cc-extension/utils/serializer.js` | 安全序列化（循环引用、CC 类型处理） |
