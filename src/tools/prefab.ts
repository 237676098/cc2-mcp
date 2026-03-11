import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

export function registerPrefabTools(server: McpServer, bridge: BridgeClient) {
  // --- Read-only tools ---

  server.tool(
    'cc_list_prefabs',
    'List all .prefab files in the project',
    {
      path: z.string().optional().describe('Asset directory to search (default: db://assets)'),
    },
    async ({ path }) => {
      const pattern = (path || 'db://assets') + '/**/*.prefab';
      const data = await bridge.send('asset', 'queryAssets', { pattern, type: null });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_prefab_info',
    'Read a .prefab file structure without instantiating (node tree, components)',
    {
      path: z.string().optional().describe('Prefab asset URL (db://assets/...)'),
      uuid: z.string().optional().describe('Prefab asset UUID'),
    },
    async (params) => {
      const data = await bridge.send('project', 'readPrefab', { url: params.path, uuid: params.uuid });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_prefab_status',
    'Check if a node is a prefab instance and get its prefab info',
    {
      path: z.string().optional().describe('Node path'),
      uuid: z.string().optional().describe('Node UUID'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'getPrefabStatus', { path: params.path, uuid: params.uuid });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // --- Write tools ---

  server.tool(
    'cc_instantiate_prefab',
    'Load a prefab asset and instantiate it into the current scene',
    {
      prefabUuid: z.string().optional().describe('Prefab asset UUID'),
      prefabPath: z.string().optional().describe('Prefab asset URL (db://assets/...)'),
      parentPath: z.string().optional().describe('Parent node path (default: scene root)'),
      position: z.object({ x: z.number(), y: z.number() }).optional().describe('Initial position'),
    },
    async (params) => {
      // If path is given but not uuid, resolve uuid first
      let prefabUuid = params.prefabUuid;
      if (!prefabUuid && params.prefabPath) {
        const info = await bridge.send('asset', 'getAssetInfoByUrl', { url: params.prefabPath });
        prefabUuid = (info as any)?.uuid;
        if (!prefabUuid) {
          return { content: [{ type: 'text', text: 'Prefab not found: ' + params.prefabPath }], isError: true };
        }
      }
      if (!prefabUuid) {
        return { content: [{ type: 'text', text: 'Either prefabUuid or prefabPath is required' }], isError: true };
      }
      const data = await bridge.send('scene', 'instantiatePrefab', {
        prefabUuid,
        parentPath: params.parentPath,
        position: params.position,
      });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_create_prefab',
    'Save a scene node as a .prefab file',
    {
      nodePath: z.string().optional().describe('Node path to save as prefab'),
      nodeUuid: z.string().optional().describe('Node UUID to save as prefab'),
      savePath: z.string().describe('Asset URL to save the prefab (e.g. db://assets/prefabs/enemy.prefab)'),
    },
    async (params) => {
      // Step 1: Serialize the node in the scene render process
      const serialized = await bridge.send('scene', 'serializeNodeToPrefab', {
        path: params.nodePath,
        uuid: params.nodeUuid,
      });
      const json = (serialized as any)?.json;
      if (!json) {
        return { content: [{ type: 'text', text: 'Failed to serialize node to prefab format' }], isError: true };
      }
      // Step 2: Write the prefab file via project domain
      const data = await bridge.send('project', 'writePrefab', {
        url: params.savePath,
        content: json,
      });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
