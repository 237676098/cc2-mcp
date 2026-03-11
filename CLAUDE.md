# cc2-mcp

MCP Server for Cocos Creator 2.4.3+ 编辑器，让 AI 助手通过 MCP 协议操控 CC 编辑器中的场景、节点、组件和资源。

## 项目结构

```
src/                  # TypeScript MCP Server (ESM)
├── index.ts          # 入口，STDIO transport
├── server.ts         # McpServer 创建 & 注册
├── bridge/           # WebSocket 桥接层 (protocol, client, queue)
├── tools/            # 28 个工具 (scene, node, component, asset, project, editor)
└── resources/        # 5 个资源 (cc://scene/*, cc://project/*)

cc-extension/         # Cocos Creator 编辑器扩展 (CommonJS, 纯 JS)
├── main.js           # WS 服务端 + 域路由
├── scene-walker.js   # 场景渲染进程，访问 cc.* API
└── utils/serializer.js

scripts/              # 辅助脚本
test/                 # 测试
specs/                # 详细规范文档 (见下方索引)
```

## 常用命令

```bash
npm run build         # 编译 TypeScript → dist/
npm run dev           # tsc --watch
npm run start         # 启动 MCP Server
npm test              # vitest
```

## 规范文档索引

| 文件 | 内容 |
|------|------|
| [specs/architecture.md](specs/architecture.md) | 整体架构、Bridge 协议、域路由 |
| [specs/typescript-conventions.md](specs/typescript-conventions.md) | TypeScript/ESM 编码规范、构建注意事项 |
| [specs/cc-extension.md](specs/cc-extension.md) | CC 扩展开发规范、API 陷阱与变通 |
| [specs/tools-and-resources.md](specs/tools-and-resources.md) | 工具/资源注册模式、命名规范 |
| [specs/testing.md](specs/testing.md) | 测试方法与 mock 说明 |
