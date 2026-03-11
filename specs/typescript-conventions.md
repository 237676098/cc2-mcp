# TypeScript / ESM 编码规范

## 模块系统

- `package.json` 中 `"type": "module"`，项目为 ESM
- tsconfig: `module: "Node16"`, `moduleResolution: "Node16"`
- **所有本地 import 必须使用 `.js` 扩展名**（ESM 强制要求）
  ```typescript
  import { BridgeClient } from './bridge/client.js';  // ✅
  import { BridgeClient } from './bridge/client';     // ❌
  ```
- SDK 导入也需要完整路径：
  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  ```

## 构建

- 编译命令：`npm run build`（即 `tsc`）
- 编译大型项目时可能需要：`NODE_OPTIONS="--max-old-space-size=4096" npm run build`
- `skipLibCheck: true` 是必须的，避免 Zod 类型检查报错
- 输出目录：`dist/`，sourceMap 开启

## tsconfig 关键配置

```json
{
  "target": "ES2020",
  "module": "Node16",
  "moduleResolution": "Node16",
  "strict": true,
  "skipLibCheck": true,
  "esModuleInterop": true,
  "outDir": "dist",
  "rootDir": "src"
}
```

## 代码风格

- 使用 Zod 做参数校验（所有工具入参都有 schema）
- 错误处理依赖 MCP SDK 自动捕获，工具 handler 内一般不需要显式 try-catch
- 返回格式统一为 `{ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }`
- 验证失败返回 `{ content: [...], isError: true }`
