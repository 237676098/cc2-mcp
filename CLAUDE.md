# CLAUDE.md

本文件为 Claude Code 提供代码库的开发指南。

## 构建与运行

```bash
npm run build          # 编译 TypeScript（使用 --max-old-space-size=4096）
npm run dev            # 监视模式（tsc --watch）
npm run start          # 运行编译后的服务：node dist/index.js
npm test               # 运行测试：vitest --run
```

安装扩展到 Cocos Creator 项目：
```bash
npx ts-node scripts/install-extension.ts <cocos-project-path>
```

运行 mock 服务器（不需要 Cocos Creator 的本地测试）：
```bash
npx ts-node test/mock-extension.ts
```

## 架构

面向 Cocos Creator 2.4.3+ 编辑器的 MCP Server。AI 助手通过 STDIO (JSON-RPC) → MCP Server (TypeScript/ESM) → WebSocket 桥接 → CC 扩展 (CommonJS/纯 JS) 与编辑器通信。

```
AI Client ──STDIO──▶ MCP Server (src/) ──WebSocket:9531──▶ CC Extension (cc-extension/)
```

**MCP Server (`src/`)** — TypeScript, ESM（`"type": "module"`, module: Node16）。入口 `index.ts` 创建 STDIO transport；`server.ts` 创建 McpServer 并注册 28 个工具 + 5 个资源。

**Bridge (`src/bridge/`)** — WebSocket 客户端，支持自动重连（指数退避 1s→30s）、心跳（15s）、基于 UUID 关联 ID 的请求队列。协议定义 4 个域：`scene`、`asset`、`project`、`editor`。默认超时 30s，构建超时 120s。

**Tools (`src/tools/`)** — 按域组织：scene(4)、node(8)、component(5)、asset(8)、project(4)、editor(6)。全部使用 Zod schema 验证参数。节点通过 `path`（如 "Canvas/player"）或 `uuid` 标识，资源使用 `db://assets/...` URL。

**CC Extension (`cc-extension/`)** — 运行在 Cocos Creator 内。`main.js` 托管 WS 服务器并按域路由。Scene 域调用委托给 `scene-walker.js`（通过 `Editor.Scene.callSceneScript()`，运行在渲染进程中可访问 `cc.*` API）。`serializer.js` 处理循环引用和 CC 类型（Vec2、Vec3、Size、Rect、Color）。

## 代码约定

- 所有本地 `.ts` 导入必须使用 `.js` 扩展名（ESM 要求）
- tsconfig 中 `skipLibCheck: true` 是必需的（MCP SDK 的 Zod 类型很重）
- `cc-extension/` 是纯 JavaScript（CommonJS），排除在 tsc 编译之外
- `scene-walker.js` 运行在不同进程（场景渲染进程）中 — 无法直接使用 Node.js API
- 工具处理器模式：每个文件导出一个 `register*Tools(server, bridge)` 函数

## Cocos Creator 2.x 非官方 API 参考

以下 API 未在官方文档中充分说明，但在本项目中实际验证可用。基于 CC 2.4.3 版本。

### 编辑器主进程 API（`main.js` 中可用）

#### Editor.Scene.callSceneScript(extensionName, method, params, callback)

调用扩展的场景脚本（`scene-walker.js`）中导出的方法。这是主进程与场景渲染进程通信的唯一方式。

```javascript
Editor.Scene.callSceneScript('cc2-mcp-bridge', 'getSceneTree', { maxDepth: 2 }, function (err, result) {
  // err 为字符串（错误消息）或 null
  // result 为场景脚本中 event.reply(null, data) 返回的数据
});
```

**注意事项：**
- `params` 必须是可 JSON 序列化的对象或 `null`
- 场景脚本中通过 `event.reply(err, data)` 返回结果，`err` 应该是字符串或 `null`
- 如果当前没有打开的场景，回调会收到错误

#### Editor.assetdb 资源数据库

| 方法 | 签名 | 可靠性 | 说明 |
|------|------|--------|------|
| `queryAssets` | `(pattern, type, callback)` | **可靠** | 支持 glob 模式如 `db://assets/**/*.fire`，`type` 可以是 `'scene'`、`'javascript'`、`'typescript'`、`null`（全部） |
| `queryPathByUuid` | `(uuid, callback)` | **可靠** | 通过 UUID 获取资源的绝对路径 |
| `queryInfoByUuid` | `(uuid, callback)` | **可靠** | 返回资源元数据对象 |
| `queryUrlByUuid` | `(uuid, callback)` | **可靠** | 通过 UUID 获取 `db://` URL |
| `queryUuidByUrl` | `(url, callback)` | **不可靠** | ⚠️ 对 `.ts` 文件回调经常不触发，建议用 `queryAssets` 替代 |
| `queryPathByUrl` | `(url, callback)` | **不可靠** | ⚠️ 对 `.ts` 文件回调经常不触发，建议直接转换路径 |
| `create` | `(url, content, callback)` | 可靠 | 创建资源文件 |
| `delete` | `([urls], callback)` | 可靠 | 参数是 URL 数组 |
| `move` | `(srcUrl, destUrl, callback)` | 可靠 | 移动/重命名资源 |
| `refresh` | `(url, callback)` | 可靠 | 刷新资源数据库，写入文件后需调用 |

**回调格式：** `function(err, result)` — `err` 为 Error 对象或 null。

**`queryAssets` 结果对象字段：** `{ url, path, uuid, type }`

**URL 到绝对路径的转换（绕过不可靠的 `queryPathByUrl`）：**
```javascript
function dbUrlToAbsPath(url) {
  if (!url || !url.startsWith('db://assets')) return null;
  var projectPath = Editor.Project.path || Editor.projectPath;
  var relPath = url.replace('db://assets', 'assets');
  return path.join(projectPath, relPath);
}
```

**`queryAssets` 的 type 参数值：**
- `'scene'` — `.fire` 场景文件
- `'javascript'` — `.js` 脚本
- `'typescript'` — `.ts` 脚本（部分版本可能不支持，需 fallback 到 `null`）
- `'texture'`、`'prefab'`、`'sprite-frame'` 等
- `null` — 不按类型过滤

#### Editor.Ipc.sendToMain(channel, ...args)

向主进程发送 IPC 消息。以下是已验证可用的 channel：

| Channel | 参数 | 回调 | 说明 |
|---------|------|------|------|
| `'scene:open-by-url'` | `(url)` | 无可靠回调 | 打开场景，完成后触发 `scene:ready` 消息；打开同一场景时不触发 |
| `'scene:save-scene'` | 无 | 无可靠回调 | 保存当前场景，fire-and-forget |
| `'builder:start-task'` | `({ platform, buildPath })` | 无 | 启动构建任务 |
| `'preview-server:open'` | `({ browser })` | 无 | 启动预览 |

#### Editor.Selection 选择管理

```javascript
Editor.Selection.curSelection('node')     // 返回当前选中的节点 UUID 数组
Editor.Selection.select('node', uuid)     // 选中指定节点
Editor.Selection.clear('node')            // 清除选中
```

**type 参数值：** `'node'`、`'asset'`

#### Editor.Project 项目信息

```javascript
Editor.Project.path    // 项目绝对路径（推荐）
Editor.projectPath     // 备选方式，部分版本使用此字段
```

#### Editor.log / Editor.warn / Editor.error

```javascript
Editor.log('消息')     // 输出到编辑器控制台（info 级别）
Editor.warn('消息')    // warn 级别
Editor.error('消息')   // error 级别
```

#### 扩展生命周期消息

在 `module.exports.messages` 中可以监听编辑器事件：

```javascript
messages: {
  'scene:ready': function () {
    // 场景加载完成后触发（包括首次打开和切换场景）
    // 打开已加载的同一场景时不会触发
  },
}
```

### 场景渲染进程 API（`scene-walker.js` 中可用）

场景脚本运行在渲染进程中，可以访问完整的 `cc.*` API，但**不能**使用 Node.js API（`fs`、`path` 等）。

#### cc.director.getScene()

获取当前场景根节点。返回 `cc.Scene` 实例或 `null`。

#### cc.find(path)

按路径查找节点。路径从场景根节点的直接子节点开始，用 `/` 分隔。

```javascript
cc.find('Canvas')               // 查找 Canvas 节点
cc.find('Canvas/player/weapon')  // 查找嵌套节点
```

**注意：** 路径不包含场景节点自身的名称。

#### cc.instantiate(node)

深拷贝一个节点（包括所有组件和子节点），返回克隆体。需要手动添加到父节点：
```javascript
var clone = cc.instantiate(node);
node.parent.addChild(clone);
```

#### cc.js.getClassName(obj)

获取 CC 对象的类名字符串，如 `'cc.Label'`、`'cc.Sprite'`、`'cc.Canvas'`。

#### node._components

节点的组件数组（内部属性）。这是获取节点所有组件的直接方式：

```javascript
var comps = node._components;   // Component[] 数组
comps.map(function(c) { return cc.js.getClassName(c); })
```

**为什么不用 `getComponents()`：** `node.getComponents(cc.Component)` 也能工作，但 `_components` 更直接，且本项目中已广泛使用。

#### node.removeFromParent(cleanup)

从父节点移除。`cleanup` 参数设为 `false` 可以保留节点不被销毁（用于移动节点）：
```javascript
node.removeFromParent(false);   // 移除但不销毁
newParent.addChild(node);       // 添加到新父节点
```

#### node.setSiblingIndex(index)

设置节点在兄弟节点中的排序位置。

#### cc.Object._deferredDestroy()

**内部 API**。强制立即执行所有已标记为 `destroy()` 的对象的销毁操作。

```javascript
comp.destroy();
cc.Object._deferredDestroy();   // 立即清理，不等到帧结束
```

**背景：** CC2 的 `destroy()` 是延迟执行的，实际销毁发生在当前帧结束时。如果在 `destroy()` 后立刻查询组件列表（如 `getComponents`），被销毁的组件仍然存在。调用 `_deferredDestroy()` 可以强制立即清理。

#### 组件属性访问（原型链遍历）

CC2 组件的用户可见属性（如 `cc.Label.string`、`cc.Label.fontSize`）定义为原型链上的 getter/setter，**不是**实例自身的可枚举属性。

```javascript
// ❌ Object.keys(comp) 无法获取 string、fontSize 等属性
// ✅ 需要遍历原型链：
var proto = Object.getPrototypeOf(comp);
while (proto && proto !== Object.prototype) {
  var names = Object.getOwnPropertyNames(proto);
  for (var n = 0; n < names.length; n++) {
    var desc = Object.getOwnPropertyDescriptor(proto, names[n]);
    if (desc && desc.get) {
      // 这是一个 getter 属性，如 string、fontSize 等
    }
  }
  proto = Object.getPrototypeOf(proto);
}
```

**注意事项：**
- 跳过 `_` 开头的内部属性
- 跳过 `node`、`uuid`、`enabled`、`constructor` 等基类属性
- **不要使用** `Object.getOwnPropertyDescriptors()`（CC2 渲染进程的 V8 可能不支持）
- **不要使用** `{ __proto__: null }` 语法（可能导致解析错误），用普通对象 `{ key: 1 }` 替代

### 场景渲染进程 V8 兼容性

`scene-walker.js` 运行在 CC2 内嵌的较旧版本 V8 中，以下特性可能不可用：

| 特性 | 可用性 | 替代方案 |
|------|--------|----------|
| `Object.getOwnPropertyDescriptors()` | ❌ 不可用 | 逐个调用 `Object.getOwnPropertyDescriptor()` |
| `{ __proto__: null }` 字面量 | ❌ 可能报错 | 使用普通对象 `{ key: 1, ... }` |
| `Object.getPrototypeOf()` | ✅ 可用 | — |
| `Object.getOwnPropertyNames()` | ✅ 可用 | — |
| `Object.getOwnPropertyDescriptor()` | ✅ 可用 | — |
| `Object.keys()` | ✅ 可用 | — |
| `WeakSet` | ✅ 可用 | — |
| `Array.isArray()` | ✅ 可用 | — |
| 箭头函数 | ❌ 避免使用 | 使用 `function(){}` |
| `let` / `const` | ⚠️ 不确定 | 使用 `var` 更安全 |
| 模板字符串 | ⚠️ 不确定 | 使用字符串拼接 |
