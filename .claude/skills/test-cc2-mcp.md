# cc2-mcp 测试（支持部分测试）

你是一个 cc2-mcp MCP 服务的测试工程师。根据参数决定测试范围，逐一调用 MCP 工具验证返回结果，最后输出测试报告。如有失败用例，自动生成 bug 计划文件。

## 参数解析

通过 `$ARGUMENTS` 接收参数，支持以下格式：

- **无参数** → 全量测试（所有 8 个阶段）
- **域名** → `/test-cc2-mcp node` 或 `/test-cc2-mcp node,asset,scene`
- **阶段号** → `/test-cc2-mcp phase:3` 或 `/test-cc2-mcp phase:3,5`
- **用例编号** → `/test-cc2-mcp case:N-5,A-3`

### 域名映射表

| 域名 | 阶段 | 前缀 | 用例编号 |
|------|------|------|----------|
| project | 1 | P | P-1 ~ P-4 |
| scene | 2 | S | S-1 ~ S-5 |
| node | 3 | N | N-1 ~ N-17 |
| component | 4 | C | C-1 ~ C-8 |
| asset | 5 | A | A-1 ~ A-11 |
| editor | 6 | E | E-1 ~ E-8 |
| resource | 7 | R | R-1 ~ R-5 |
| edge | 8 | X | X-1 ~ X-5 |

### 解析规则

1. 参数为空 → 运行全部阶段 1~8
2. 参数是逗号分隔的域名（如 `node,asset`）→ 运行对应阶段
3. 参数以 `phase:` 开头（如 `phase:3,5`）→ 运行指定阶段号
4. 参数以 `case:` 开头（如 `case:N-5,A-3`）→ 只运行指定用例

## 测试原则

1. 每个测试用例调用对应的 MCP 工具，检查返回结果是否合理
2. 有副作用的操作必须在阶段结束后清理还原
3. 测试过程中记录每个用例的 PASS/FAIL 状态和关键信息
4. 最终输出汇总测试报告
5. 如有失败用例，生成 `.claude/bug-plan.md`

## 依赖处理

部分测试用例依赖前序用例的输出数据。运行部分测试时，自动静默执行前置数据获取：

| 用例 | 依赖 | 前置操作 |
|------|------|----------|
| S-4 | P-2 的场景 URL | 静默执行 `cc_list_scenes` 获取场景 URL |
| A-3 | P-2 的场景 URL | 静默执行 `cc_list_scenes` 获取场景 URL |
| E-7, E-8 | Canvas UUID | 静默执行 `cc_get_node`(path:"Canvas") 获取 UUID |

规则：
- 前置数据获取不计入测试结果
- 报告中标注 "[前置数据获取]" 说明已自动执行
- 如果前置获取失败，跳过依赖该数据的用例并标记 SKIP

## 清理隔离

每个阶段独立清理，即使部分用例失败也必须执行清理：

| 阶段 | 清理目标 |
|------|----------|
| Node (3) | 删除 `Canvas/__test_node__`、`Canvas/__test_node_renamed__`、`Canvas/__test_parent__` 及所有副本节点 |
| Component (4) | 删除 `Canvas/__test_comp_node__` |
| Asset (5) | 删除 `db://assets/Script/__test_script_moved__.ts` 或 `db://assets/Script/__test_script__.ts`（哪个存在删哪个） |

清理规则：
- 每个阶段的所有用例执行完毕后，无论成功失败，都执行清理
- 清理操作失败不影响测试结果，但在报告中标注 "[清理失败]"
- 清理操作不计入测试用例数

## 测试执行流程

### 阶段 1：项目信息（Project）

**P-1** `cc_get_project_info`
- 调用获取项目信息
- 验证返回包含 path、name、engineVersion 字段

**P-2** `cc_list_scenes`
- 调用列出所有场景
- 验证返回是数组，每项包含 url 和 uuid

**P-3** `cc_list_scripts`
- 调用列出所有脚本
- 验证返回是数组，每项包含 url 和 uuid

**P-4** `cc_get_project_settings`
- 调用获取项目设置（category: "project"）
- 验证返回包含设置数据

### 阶段 2：场景操作（Scene）

**S-1** `cc_get_current_scene_info`
- 调用获取当前场景信息
- 验证返回包含 name、uuid、childCount

**S-2** `cc_get_scene_tree`
- 不带参数调用
- 验证返回包含完整节点树（name、children、uuid 等）

**S-3** `cc_get_scene_tree` (带 maxDepth)
- 调用时传入 maxDepth: 1
- 验证返回的树深度不超过 1 层

**S-4** `cc_open_scene`
- 用 P-2 获取到的场景路径打开场景
- 验证操作成功

**S-5** `cc_save_scene`
- 调用保存当前场景
- 验证操作成功

### 阶段 3：节点操作（Node）

**N-1** `cc_get_node` (by path)
- 调用获取 "Canvas" 节点
- 验证返回包含 name、uuid、position、size、components 等

**N-2** `cc_get_node` (by uuid)
- 用 N-1 获取到的 uuid 再次查询
- 验证两次返回的节点信息一致

**N-3** `cc_find_nodes`
- 用 pattern "label" 搜索节点
- 验证返回匹配的节点列表

**N-4** `cc_get_node_children`
- 获取 "Canvas" 的子节点列表
- 验证返回数组

**N-5** `cc_create_node`
- 在 Canvas 下创建名为 "__test_node__" 的节点，position: {x: 100, y: 100}
- 验证返回成功，记录新节点 uuid

**N-6** `cc_set_node_property` (position)
- 修改 __test_node__ 的 position 为 {x: 200, y: 200}
- 验证操作成功

**N-7** `cc_set_node_property` (size)
- 修改 __test_node__ 的 size 为 {width: 100, height: 50}
- 验证操作成功

**N-8** `cc_set_node_property` (color)
- 修改 __test_node__ 的 color 为 {r: 255, g: 0, b: 0}
- 验证操作成功

**N-9** `cc_set_node_property` (opacity)
- 修改 __test_node__ 的 opacity 为 128
- 验证操作成功

**N-10** `cc_set_node_property` (rotation)
- 修改 __test_node__ 的 rotation 为 45
- 验证操作成功

**N-11** `cc_set_node_property` (scale)
- 修改 __test_node__ 的 scale 为 {x: 2, y: 2}
- 验证操作成功

**N-12** `cc_set_node_property` (active)
- 修改 __test_node__ 的 active 为 false
- 验证操作成功

**N-13** `cc_set_node_property` (name)
- 修改 __test_node__ 的 name 为 "__test_node_renamed__"
- 验证操作成功

**N-14** `cc_get_node` (验证属性修改)
- 获取 __test_node_renamed__ 节点
- 验证 position、size、opacity、rotation、scale、active、name 均已更新

**N-15** `cc_duplicate_node`
- 复制 __test_node_renamed__
- 验证返回成功，记录副本 uuid

**N-16** `cc_move_node`
- 创建一个临时父节点 "__test_parent__" 在 Canvas 下
- 将 __test_node_renamed__ 移动到 __test_parent__ 下
- 验证操作成功

**N-17** `cc_delete_node` (清理)
- 删除 __test_parent__（含子节点 __test_node_renamed__）
- 删除复制出来的副本节点
- 验证删除成功

### 阶段 4：组件操作（Component）

**C-1** `cc_get_components`
- 获取 "Canvas" 节点的所有组件
- 验证返回包含 cc.Canvas 等

**C-2** `cc_get_component`
- 获取 "Canvas/label" 节点的 cc.Label 组件详情
- 验证返回包含组件属性（如 string、fontSize 等）

**C-3** `cc_add_component`
- 先创建测试节点 "__test_comp_node__" 在 Canvas 下
- 给该节点添加 cc.Label 组件
- 验证操作成功

**C-4** `cc_set_component_property`
- 修改 __test_comp_node__ 的 cc.Label 的 string 属性为 "test_text"
- 验证操作成功

**C-5** `cc_get_component` (验证修改)
- 获取 __test_comp_node__ 的 cc.Label 组件
- 验证 string 属性已变为 "test_text"

**C-6** `cc_remove_component`
- 移除 __test_comp_node__ 的 cc.Label 组件
- 验证操作成功

**C-7** `cc_get_components` (验证移除)
- 获取 __test_comp_node__ 的组件列表
- 验证 cc.Label 已不在列表中

**C-8** 清理
- 删除 __test_comp_node__

### 阶段 5：资源操作（Asset）

**A-1** `cc_list_assets`
- 列出 db://assets 下所有资源
- 验证返回是数组，包含场景和脚本资源

**A-2** `cc_list_assets` (带 type 过滤)
- 用 type: "scene" 过滤
- 验证只返回场景类型资源

**A-3** `cc_get_asset_info`
- 用 P-2 获取到的场景 url 查询资源信息
- 验证返回包含 uuid、type 等元数据

**A-4** `cc_read_script`
- 读取 db://assets/Script/HelloWord.ts 的内容
- 验证返回脚本源码字符串

**A-5** `cc_create_asset`
- 创建测试脚本 db://assets/Script/__test_script__.ts，内容为简单的 cc.Class
- 验证操作成功

**A-6** `cc_read_script` (验证创建)
- 读取刚创建的 __test_script__.ts
- 验证内容与写入一致

**A-7** `cc_write_script`
- 修改 __test_script__.ts 内容，追加一行注释
- 验证操作成功

**A-8** `cc_read_script` (验证修改)
- 再次读取 __test_script__.ts
- 验证内容已更新

**A-9** `cc_move_asset`
- 将 __test_script__.ts 重命名为 __test_script_moved__.ts
- 验证操作成功

**A-10** `cc_delete_asset` (清理)
- 删除 __test_script_moved__.ts
- 验证操作成功

### 阶段 6：编辑器操作（Editor）

**E-1** `cc_get_console_logs`
- 获取最近的控制台日志
- 验证返回是数组

**E-2** `cc_get_console_logs` (带 level 过滤)
- 用 level: "error" 过滤
- 验证返回的日志均为 error 级别（或空数组）

**E-3** `cc_log_message`
- 发送一条 log 级别消息 "[cc2-mcp-test] test log message"
- 验证操作成功

**E-4** `cc_log_message` (warn)
- 发送一条 warn 级别消息 "[cc2-mcp-test] test warn message"
- 验证操作成功

**E-5** `cc_log_message` (error)
- 发送一条 error 级别消息 "[cc2-mcp-test] test error message"
- 验证操作成功

**E-6** `cc_get_selection`
- 获取当前编辑器选中的节点
- 验证返回格式正确（数组或空）

**E-7** `cc_set_selection`
- 用 Canvas 节点的 uuid 设置选中
- 验证操作成功

**E-8** `cc_get_selection` (验证设置)
- 再次获取选中节点
- 验证返回包含 Canvas 的 uuid

### 阶段 7：MCP Resources 读取

**R-1** 读取 `cc://scene/tree`
- 使用 ReadMcpResourceTool 读取，server 为 "cc2-mcp"
- 验证返回场景节点树 JSON

**R-2** 读取 `cc://scene/info`
- 验证返回场景元数据 JSON

**R-3** 读取 `cc://project/info`
- 验证返回项目信息 JSON

**R-4** 读取 `cc://project/scenes`
- 验证返回场景列表 JSON

**R-5** 读取 `cc://project/scripts`
- 验证返回脚本列表 JSON

### 阶段 8：边界与异常测试

**X-1** `cc_get_node` (不存在的路径)
- 查询 "Canvas/nonexistent_node_12345"
- 验证返回错误或空结果，不崩溃

**X-2** `cc_find_nodes` (无匹配)
- 用 pattern "zzz_no_match_zzz" 搜索
- 验证返回空数组

**X-3** `cc_get_component` (不存在的组件)
- 查询 Canvas 节点的 "cc.NonExistentComponent"
- 验证返回错误或空，不崩溃

**X-4** `cc_delete_node` (不存在的节点)
- 删除路径 "Canvas/nonexistent_node_12345"
- 验证返回错误，不崩溃

**X-5** `cc_set_node_property` (无效属性)
- 对 Canvas 设置不存在的属性 "fakeProperty" 值为 123
- 验证返回错误或忽略，不崩溃

## 执行流程

1. **解析参数**：根据 `$ARGUMENTS` 确定测试范围（全量/域/阶段/用例）
2. **前置数据获取**：如果选中的用例有依赖，静默执行前置操作获取所需数据，标注 "[前置数据获取]"
3. **按阶段顺序执行**：按阶段编号从小到大执行选中的测试用例
4. **阶段清理**：每个阶段的用例执行完毕后，执行该阶段的清理操作（无论成功失败）
5. **输出测试报告**：仅包含实际运行的用例（不含前置获取和清理）
6. **生成 bug 计划**：如有失败用例，生成 `.claude/bug-plan.md` 并提示路径；无失败则删除已存在的旧文件

## 测试报告格式

```
## cc2-mcp 测试报告

测试时间：{当前时间}
项目：{项目名} (引擎版本 {版本})
场景：{当前场景名}
测试范围：{全量 / 域名列表 / 阶段列表 / 用例列表}

### 汇总
- 总用例数：{N}
- 通过：{P}
- 失败：{F}
- 跳过：{S}
- 通过率：{P/N * 100}%

### 详细结果
| 编号 | 模块 | 测试项 | 状态 | 备注 |
|------|------|--------|------|------|
| P-1  | Project | cc_get_project_info | PASS/FAIL/SKIP | ... |
| ...  | ...     | ...                 | ...            | ... |

### 失败用例详情
（如有失败用例，列出详细错误信息和返回值）

### 前置数据获取
（如有自动执行的前置操作，在此列出）

### 清理状态
（列出各阶段清理结果）
```

## Bug 计划输出

测试完成后，如有失败用例，写入 `.claude/bug-plan.md`：

```markdown
# cc2-mcp Bug 修复计划
生成时间：{时间戳}
测试范围：{范围描述}
失败数量：{N}

## Bug 列表

### BUG-001: {用例编号} {用例描述}
- 用例：{编号}
- 工具：{tool_name}
- 域：{domain}
- 状态：待修复
- 错误信息：{实际错误或返回值}
- 预期行为：{期望的正确结果}
- 相关文件：
  - MCP 工具：src/tools/{domain}.ts
  - CC 扩展：cc-extension/main.js
  - 场景脚本：cc-extension/scene-walker.js（scene/node/component 域时）
- 修复建议：{根据错误信息推测的修复方向}
```

规则：
- Bug 编号从 BUG-001 开始递增
- 无失败用例时不生成文件；如已存在旧的 `.claude/bug-plan.md` 则删除
- 域名到文件的映射：project/scene/node/component → scene-walker.js 参与；asset/editor → 仅 main.js