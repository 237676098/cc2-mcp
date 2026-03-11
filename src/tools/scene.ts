import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

export function registerSceneTools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    'cc_get_scene_tree',
    'Get the current scene node tree',
    { maxDepth: z.number().optional().describe('Maximum depth to traverse (default: all)') },
    async ({ maxDepth }) => {
      const data = await bridge.send('scene', 'getSceneTree', { maxDepth });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_current_scene_info',
    'Get current scene metadata (name, uuid, child count)',
    {},
    async () => {
      const data = await bridge.send('scene', 'getCurrentSceneInfo');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_open_scene',
    'Open a scene by its asset path (db://assets/...)',
    { scenePath: z.string().describe('Scene asset URL, e.g. db://assets/scenes/main.fire') },
    async ({ scenePath }) => {
      const data = await bridge.send('editor', 'openScene', { url: scenePath });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_save_scene',
    'Save the current scene',
    {},
    async () => {
      const data = await bridge.send('editor', 'saveScene', {});
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
