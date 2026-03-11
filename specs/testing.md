# 测试

## 测试框架

使用 [vitest](https://vitest.dev/)，命令：`npm test`（即 `vitest --run`）

## Mock 服务

`test/mock-extension.ts` 提供了一个模拟 CC 编辑器的 WebSocket 服务，返回所有域/方法的硬编码响应。

### 无编辑器测试流程

```bash
# 终端 1：启动 mock 服务
npx ts-node test/mock-extension.ts

# 终端 2：编译并启动 MCP Server
npm run build && npm run start
```

## 真机测试

测试项目路径：`C:\Users\zyb\Desktop\TestMcp`

1. 安装扩展到测试项目：
   ```bash
   npx ts-node scripts/install-extension.ts C:\Users\zyb\Desktop\TestMcp
   ```
2. 在 CC 编辑器中打开测试项目
3. 场景文件：`assets/Scene/helloworld.fire`
4. 脚本文件：`HelloWord.ts`（注意：项目中是这个拼写）
