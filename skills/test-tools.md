---
name: test-tools
description: 测试 MCP 工具，记录 bug 到 bug_fix.md
args:
  tools:
    description: 要测试的工具名称，用逗号分隔，留空则测试所有工具
    required: false
---

# 测试 MCP 工具

你需要系统地测试 cc2-mcp 项目的 MCP 工具。

## 测试环境

- 测试项目：`C:\Users\zyb\Desktop\TestMcp`
- 编辑器日志：`C:\Users\zyb\.CocosCreator\logs\native.log`
- Bug 跟踪文件：`D:\work\zuoyebang\cc2-mcp\bug_fix.md`

## 测试流程

### 1. 启动编辑器

使用命令启动 Cocos Creator：
```bash
start "" "C:\CocosCreator\CocosCreator.exe" "C:\Users\zyb\Desktop\TestMcp"
```

等待 10 秒让编辑器完全启动。

### 2. 确定测试范围

如果用户指定了 `tools` 参数，只测试指定的工具；否则测试所有工具。

当前项目有 60 个工具，分为以下类别：
- Scene (4): cc_get_scene_tree, cc_get_current_scene_info, cc_open_scene, cc_save_scene
- Node (8): cc_get_node, cc_find_nodes, cc_create_node, cc_delete_node, cc_set_node_property, cc_move_node, cc_duplicate_node, cc_get_node_children
- Component (5): cc_get_components, cc_get_component, cc_add_component, cc_remove_component, cc_set_component_property
- Asset (8): cc_list_assets, cc_get_asset_info, cc_create_asset, cc_delete_asset, cc_move_asset, cc_read_script, cc_write_script, cc_refresh_assets
- Project (4): cc_get_project_info, cc_list_scenes, cc_list_scripts, cc_get_project_settings
- Editor (6): cc_get_console_logs, cc_log_message, cc_get_selection, cc_set_selection, cc_build_project, cc_preview_project
- Animation (7): cc_list_animations, cc_read_animation_clip, cc_get_node_animations, cc_create_animation_clip, cc_edit_animation_clip, cc_set_node_animation_clip, cc_play_animation
- Prefab (5): cc_list_prefabs, cc_get_prefab_info, cc_get_prefab_status, cc_instantiate_prefab, cc_create_prefab
- Spine (9): cc_get_spine_info, cc_get_spine_bones, cc_get_spine_slots, cc_get_spine_animations, cc_get_spine_skins, cc_set_spine_property, cc_spine_set_animation, cc_spine_add_animation, cc_spine_set_skin
- UI (9): cc_setup_button, cc_setup_editbox, cc_setup_scrollview, cc_setup_layout, cc_setup_toggle, cc_setup_slider, cc_setup_progressbar, cc_setup_richtext, cc_setup_widget
- Create (2): cc_create_typescript_component, cc_create_scene

### 3. 执行测试

对每个工具：

1. **设计测试用例**：根据工具功能设计合理的测试参数
   - 不依赖 TestMcp 项目中的固定文件
   - 如果需要文件，先创建测试文件
   - 使用临时的、可预测的命名（如 test_xxx）

2. **调用工具**：使用 MCP 工具执行测试

3. **检查结果**：
   - 检查工具返回值是否符合预期
   - 检查编辑器日志是否有 error（读取 `C:\Users\zyb\.CocosCreator\logs\native.log`）

4. **记录 bug**：如果发现问题，添加到 `bug_fix.md`：
   ```markdown
   ### [待解决] 工具名称 - 简短描述

   **发现时间**：YYYY-MM-DD HH:mm

   **测试用例**：
   - 参数：xxx
   - 预期：xxx
   - 实际：xxx

   **错误信息**：
   ```
   错误日志
   ```

   **相关文件**：
   - src/tools/xxx.ts
   ```

### 4. 清理测试数据

删除测试过程中创建的临时文件和节点。

### 5. 关闭编辑器

使用命令关闭：
```bash
taskkill /F /IM CocosCreator.exe
```

## 测试策略

- **优先测试高频工具**：Scene, Node, Component, Asset
- **分组测试**：相关工具一起测试（如先创建节点，再测试获取节点）
- **边界测试**：测试空值、不存在的路径等边界情况
- **错误恢复**：如果某个工具失败，继续测试其他工具

## 输出格式

测试完成后，输出摘要：
```
测试完成：
- 总计：X 个工具
- 通过：X 个
- 失败：X 个
- Bug 记录：X 个

详见 bug_fix.md
```
