# 工具与资源注册规范

## 工具 (Tools)

### 注册模式

每个域一个文件，导出 `register*Tools(server, bridge)` 函数：

```typescript
export function registerSceneTools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    'cc_tool_name',           // 命名：cc_ 前缀 + snake_case
    'Human-readable description',
    { param: z.string().describe('...') },  // Zod schema
    async (params) => {
      const data = await bridge.send('domain', 'method', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
```

### 工具汇总编排

`src/tools/index.ts` 统一注册所有域的工具：

```typescript
export function registerTools(server: McpServer, bridge: BridgeClient) {
  registerSceneTools(server, bridge);
  registerNodeTools(server, bridge);
  // ...
}
```

### 命名规范

- 工具名：`cc_` 前缀 + `snake_case`，例如 `cc_get_scene_tree`
- 域文件：`src/tools/{domain}.ts`

### 28 个工具分布

| 域 | 数量 | 示例 |
|----|------|------|
| scene | 4 | `cc_get_scene_tree`, `cc_open_scene`, `cc_save_scene` |
| node | 8 | `cc_get_node`, `cc_create_node`, `cc_set_node_property` |
| component | 5 | `cc_get_component`, `cc_add_component`, `cc_set_component_property` |
| asset | 8 | `cc_list_assets`, `cc_create_asset`, `cc_read_script`, `cc_write_script` |
| project | 4 | `cc_get_project_info`, `cc_list_scenes`, `cc_list_scripts` |
| editor | 6 | `cc_get_console_logs`, `cc_build_project`, `cc_preview_project` |

### 节点/组件寻址

- 节点：`path`（如 `"Canvas/Player"`）或 `uuid`
- 组件：节点 path/uuid + `componentType`（如 `"cc.Label"`）
- 资源：`db://assets/...` URL 或 uuid

## 资源 (Resources)

### 注册模式

```typescript
server.resource(
  'resource-name',
  'cc://domain/resource',
  { description: '...', mimeType: 'application/json' },
  async () => {
    const data = await bridge.send('domain', 'method', {});
    return { contents: [{ uri: 'cc://...', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }] };
  }
);
```

### 5 个资源

| 名称 | URI | 说明 |
|------|-----|------|
| `scene-tree` | `cc://scene/tree` | 当前场景节点树 |
| `scene-info` | `cc://scene/info` | 当前场景元信息 |
| `project-info` | `cc://project/info` | 项目路径、名称、引擎版本 |
| `project-scenes` | `cc://project/scenes` | 场景文件列表 |
| `project-scripts` | `cc://project/scripts` | 脚本文件列表 |
