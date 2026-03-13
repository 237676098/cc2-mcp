# Bug 修复跟踪

## 待解决

<!-- 测试过程中发现的 bug 会自动添加到这里 -->

## 已完成

### [已完成] cc_create_scene - 生成的场景文件缺少 _zIndex 字段

**发现时间**：2026-03-13
**修复时间**：2026-03-13

**问题原因**：
`buildScene()` 函数中 cc.Scene 和 cc.Node 节点缺少 `_zIndex: 0` 字段，与编辑器自身创建的标准格式不一致。

**修复方案**：
在 Scene 节点、Canvas Node、Main Camera Node 三处添加 `_zIndex: 0` 字段。

**修改文件**：
- src/tools/create.ts:164, 197, 228

---

### [已完成] cc_open_scene - scene:ready IPC 消息不触发导致超时

**发现时间**：2026-03-13
**修复时间**：2026-03-13

**问题原因**：
使用 `Editor.Ipc.sendToMain('scene:open-by-url', url)` 打开场景，但 `scene:open-by-url` 不是 CC2 2.4.x 的有效 IPC 消息，导致场景完全不会切换。同时依赖 `scene:ready` 回调来响应，但该消息在扩展中也无法可靠接收。

**修复方案**：
1. 改用 `Editor.Ipc.sendToAll('scene:open-by-uuid', uuid)` 打开场景（先通过 `queryAssets` 将 URL 解析为 UUID）
2. 用轮询方式（每 500ms 检测当前场景 UUID）替代 `scene:ready` 回调，最多等待 15 秒
3. 简化了 `openScene` 逻辑，先解析 UUID 再判断是否已打开

**修改文件**：
- cc-extension/main.js:8-38 (pollSceneReady 函数), 722-746 (openScene handler)
