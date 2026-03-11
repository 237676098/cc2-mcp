# cc2-mcp Bug 修复

你是一个 cc2-mcp MCP 服务的修复工程师。根据 `.claude/bug-plan.md` 中的 bug 列表，自动管理 Cocos Creator 生命周期、逐一修复 bug 并验证。

## 参数解析

通过 `$ARGUMENTS` 接收参数：

- **无参数** → 修复 `bug-plan.md` 中所有状态为 "待修复" 的 bug
- **Bug 编号** → `/fix-cc2-mcp BUG-001` 或 `/fix-cc2-mcp BUG-001,BUG-003`
- **verify** → `/fix-cc2-mcp verify` 只验证不修复（重跑失败用例检查是否已修复）

## 环境配置

```
Cocos Creator：D:\SoftData\Cocos\Editors\Creator\2.4.3\CocosCreator.exe
测试项目：C:\Users\zyb\Desktop\TestMcp
编辑器日志：C:\Users\zyb\.CocosCreator\logs\CocosCreator.log
MCP 项目：D:\work\zuoyebang\cc2-mcp
WebSocket：ws://127.0.0.1:9531
```

## 前置检查

1. 读取 `.claude/bug-plan.md`，解析 bug 列表
2. 如果文件不存在，提示用户先运行 `/test-cc2-mcp` 生成 bug 计划
3. 根据参数筛选要处理的 bug
4. 确认 Cocos Creator 和 MCP 通道状态

## Cocos Creator 生命周期管理

### 启动流程

1. `tasklist | grep -i CocosCreator` 检查是否已运行
2. 未运行时：
   - 记录日志文件当前大小：`wc -c < "C:/Users/zyb/.CocosCreator/logs/CocosCreator.log"`
   - 后台启动：`"D:/SoftData/Cocos/Editors/Creator/2.4.3/CocosCreator.exe" --path "C:/Users/zyb/Desktop/TestMcp" &`
3. 轮询 9531 端口就绪（每 5s 检查，最多 120s）：
   - 尝试调用 `cc_get_project_info`
   - 成功返回 → 通道就绪
4. 等待日志出现 `[cc2-mcp-bridge] Scene ready`（可选，增强可靠性）
5. 调用 `cc_get_project_info` 最终验证通道畅通

### 停止流程

```bash
taskkill /IM CocosCreator.exe        # 优雅关闭
# 如果 10s 后仍在运行：
taskkill /F /IM CocosCreator.exe     # 强制关闭
```

### 重启流程（代码修改后需要重启）

1. 停止 Cocos Creator
2. 根据修改的文件执行构建：
   - 修改了 `src/` 下的 TS 文件 → `npm run build`
   - 修改了 `cc-extension/` 下的文件 → `npx ts-node scripts/install-extension.ts C:/Users/zyb/Desktop/TestMcp`
3. 启动 Cocos Creator → 等待就绪

## 日志监控

基于字节偏移量的增量读取策略：

1. 每次修复验证前，记录 `CocosCreator.log` 当前字节大小：
   ```bash
   wc -c < "C:/Users/zyb/.CocosCreator/logs/CocosCreator.log"
   ```
2. 执行验证操作（调用 MCP 工具）
3. 读取新增日志内容：
   ```bash
   tail -c +{offset} "C:/Users/zyb/.CocosCreator/logs/CocosCreator.log"
   ```
4. 检查新增内容中的错误关键词：`error`、`Error`、`ERROR`、`exception`、`Exception`、`FATAL`
5. 排除已知无害项：
   - `[cc2-mcp-test] test error message`（测试用例 E-5 产生的）
   - 其他已知的非致命警告
6. 发现新错误则记录到修复报告

## 单个 Bug 修复循环

每个 bug 最多尝试 3 次修复，流程如下：

### 第 1 步：分析
- 读取 bug-plan.md 中该 bug 的描述
- 读取相关源码文件（bug 中列出的 "相关文件"）
- 分析根因，制定修复方案

### 第 2 步：修复
- 修改代码文件
- 修改范围尽量小，只改必要的部分

### 第 3 步：编译
- 修改了 `src/` 下的 TS 文件 → `npm run build`
- 修改了 `cc-extension/` 下的文件 → `npx ts-node scripts/install-extension.ts C:/Users/zyb/Desktop/TestMcp`

### 第 4 步：重启（如需要）
- 修改了 `cc-extension/` 下的文件 → 必须重启 Cocos Creator
- 仅修改了 `src/` → 不需要重启（MCP Server 每次调用独立）

### 第 5 步：验证
1. 记录日志偏移量
2. 运行对应测试用例（参考 test-cc2-mcp.md 中的用例定义）
3. 检查返回结果是否符合预期
4. 检查 CocosCreator.log 无新增错误
5. 两项都通过 → 标记 "已修复 ✓"
6. 任一失败 → 进入下一次尝试

### 第 6 步：更新 bug-plan.md
- 修改对应 bug 的状态字段：
  - 修复成功 → `状态：已修复 ✓`
  - 3 次尝试均失败 → `状态：修复失败 ✗`
  - verify 模式验证通过 → `状态：已验证 ✓`

## 修复完成判定

一个 bug 完全修复的标准（两项都必须满足）：
1. MCP 工具调用返回预期结果（PASS）
2. CocosCreator.log 中无新增错误日志

## verify 模式

`/fix-cc2-mcp verify` 只读模式：
1. 读取 bug-plan.md 中所有 bug（或指定编号）
2. 不修改任何代码
3. 逐一运行对应测试用例
4. 检查结果和日志
5. 更新 bug 状态为 "已验证 ✓" 或保持原状态
6. 输出验证报告

## 修复报告

所有 bug 处理完毕后，输出修复报告：

```
## cc2-mcp 修复报告
修复时间：{时间戳}
Bug 总数：{N} | 已修复：{F} | 失败：{X} | 跳过：{S}

| Bug 编号 | 用例 | 工具 | 状态 | 尝试次数 | 修改文件 | 备注 |
|----------|------|------|------|----------|----------|------|
| BUG-001 | N-5 | cc_create_node | 已修复 ✓ | 1 | scene-walker.js | ... |
| BUG-002 | A-3 | cc_get_asset_info | 修复失败 ✗ | 3 | main.js | ... |
```