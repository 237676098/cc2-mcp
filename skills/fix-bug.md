---
name: fix-bug
description: 修复 bug_fix.md 中的 bug 并测试
args:
  bug_id:
    description: 要修复的 bug 编号或关键词，留空则修复第一个待解决的 bug
    required: false
---

# 修复 Bug

你需要修复 bug_fix.md 中记录的 bug，并验证修复效果。

## 修复流程

### 1. 读取 Bug 列表

读取 `D:\work\zuoyebang\cc2-mcp\bug_fix.md`，找到待解决的 bug。

如果用户指定了 `bug_id`，查找匹配的 bug；否则选择第一个待解决的 bug。

### 2. 分析 Bug

仔细阅读 bug 描述：
- 测试用例和参数
- 预期行为 vs 实际行为
- 错误信息和日志
- 相关文件

### 3. 定位问题

根据相关文件，读取源码：
- 检查工具实现（src/tools/*.ts）
- 检查扩展实现（cc-extension/*.js）
- 检查桥接层（src/bridge/*.ts）

找出导致 bug 的根本原因。

### 4. 修复代码

修改相关文件，修复 bug。遵循以下原则：
- 最小化改动
- 保持代码风格一致
- 考虑边界情况
- 不破坏其他功能

### 5. 编译代码

```bash
npm run build
```

确保编译通过。

### 6. 测试修复

启动编辑器并重新测试：

```bash
# 启动编辑器
start "" "C:\CocosCreator\CocosCreator.exe" "C:\Users\zyb\Desktop\TestMcp"

# 等待启动
sleep 10

# 执行相同的测试用例
# 使用 MCP 工具调用

# 检查编辑器日志
cat "C:\Users\zyb\.CocosCreator\logs\native.log" | grep -i error

# 关闭编辑器
taskkill /F /IM CocosCreator.exe
```

### 7. 更新 Bug 状态

如果测试通过：

1. 在 bug_fix.md 中将 bug 从"待解决"移动到"已完成"
2. 添加修复信息：
   ```markdown
   ### [已完成] 工具名称 - 简短描述

   **发现时间**：YYYY-MM-DD HH:mm
   **修复时间**：YYYY-MM-DD HH:mm

   **问题原因**：
   简要说明根本原因

   **修复方案**：
   简要说明修复方法

   **修改文件**：
   - src/tools/xxx.ts:行号
   ```

如果测试仍然失败：
- 继续分析和修复
- 或在 bug 描述中添加尝试记录

### 8. 提交代码

修复完成后提交：
```bash
git add -A
git commit -m "修复: [bug 简短描述]"
```

## 注意事项

- 每次只修复一个 bug
- 确保修复不引入新问题
- 如果 bug 涉及编辑器扩展（cc-extension），修复后需要在编辑器中重新加载扩展
- 如果无法修复，在 bug 描述中记录分析过程和困难

## 输出格式

修复完成后输出：
```
Bug 修复完成：
- Bug：[标题]
- 原因：[简述]
- 修复：[简述]
- 测试：通过 ✓

已更新 bug_fix.md 并提交代码。
```
