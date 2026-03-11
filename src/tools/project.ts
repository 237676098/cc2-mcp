import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

export function registerProjectTools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    'cc_get_project_info',
    'Get project path, name, and engine version',
    {},
    async () => {
      const data = await bridge.send('project', 'getInfo');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_list_scenes',
    'List all scene files in the project',
    {},
    async () => {
      const data = await bridge.send('project', 'listScenes');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_list_scripts',
    'List all script files in the project',
    { path: z.string().optional().describe('Subdirectory to search (default: all assets)') },
    async ({ path }) => {
      const data = await bridge.send('project', 'listScripts', { path });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_project_settings',
    'Get project settings',
    { category: z.string().optional().describe('Settings category (default: project)') },
    async ({ category }) => {
      const data = await bridge.send('project', 'getSettings', { category });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
