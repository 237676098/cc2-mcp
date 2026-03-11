# CC 扩展开发规范

## 运行环境

- `main.js` 运行在 CC 编辑器主进程（Node.js，可用 `require`, `fs`, `path`, `Editor.*`）
- `scene-walker.js` 运行在场景渲染进程（可用 `cc.*` API，**不可用** `fs`, `path`, `require`）
- 语法要求：CommonJS，纯 JS，**不使用箭头函数**（CC2 的 V8 版本兼容性）
- 避免使用 `Object.getOwnPropertyDescriptors` 和 `{ __proto__: null }` 语法

## scene-walker.js 要点

### 方法签名

所有导出方法遵循 `function(event, params)` 模式，通过 `event.reply(err, data)` 返回：
- `err`：错误字符串或 `null`
- `data`：返回数据

### 节点查找

- **路径查找**：`cc.find(path)` — 例如 `"Canvas/Player/Weapon"`
- **UUID 查找**：递归遍历场景树匹配 `node.uuid`
- 大多数操作同时支持 path 和 uuid 两种寻址方式

### 组件属性

- 组件属性（如 `Label.string`、`Sprite.spriteFrame`）是**原型链上的 getter/setter**，不是实例自有属性
- 必须遍历原型链才能获取完整属性列表
- 需要跳过的属性集合：`node`, `uuid`, `enabled`, `constructor`, `sharedMaterials` 等

### 资源类型属性

- `ASSET_PROPS` 定义了需要异步加载的资源属性（`spriteFrame`, `font`, `clip` 等）
- 设置这些属性时使用 `cc.assetManager.loadAny({uuid})` 加载资源对象
- UUID 提取需要处理三种格式：纯字符串、`{uuid: "..."}` 和 `{__uuid__: "..."}`

### 场景序列化

- `serializeSceneToJson()` 调用 `Editor.serialize` 后，需要在数组头部插入 `cc.SceneAsset` 包装层
- 插入后必须递增所有 `__id__` 引用（`_incrementIds`）

## main.js 要点

### Editor API 陷阱

| API | 问题 | 变通方案 |
|-----|------|----------|
| `Editor.assetdb.queryUuidByUrl` | 对 .ts 文件回调可能不触发 | 使用 `queryAssets` 替代 |
| `Editor.assetdb.queryPathByUrl` | 同上 | 使用 `queryAssets` 或直接 fs 路径 |
| `scene:open-by-url` | 同一场景已打开时不会触发 `scene:ready` | 先检查当前场景是否相同 |
| `comp.destroy()` | 延迟到帧末执行 | 调用 `cc.Object._deferredDestroy()` 立即生效 |

### 场景保存流程

1. 通过 `callSceneScript` 获取场景信息
2. 通过 `callSceneScript` 序列化场景为 JSON
3. 查询资源数据库找到场景文件路径
4. 直接 `fs.writeFileSync` 写入
5. 刷新资源数据库

### 脚本读写

- `.ts` 文件：使用直接文件系统读写 + `Editor.assetdb.refresh` 刷新（`Editor.assetdb` 回调不可靠）
- `.js` 文件：可以使用 `Editor.assetdb` API
