import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

export function registerAssetTools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    'cc_list_assets',
    'List assets in a directory',
    {
      path: z.string().optional().describe('Asset directory (e.g. db://assets/textures). Default: db://assets'),
      type: z.string().optional().describe('Filter by asset type (e.g. texture, prefab, scene)'),
      recursive: z.boolean().optional().describe('Recursive listing (default true)'),
    },
    async ({ path, type, recursive }) => {
      const pattern = (path || 'db://assets') + (recursive !== false ? '/**/*' : '/*');
      const data = await bridge.send('asset', 'queryAssets', { pattern, type: type || null });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_asset_info',
    'Get asset metadata by path or uuid',
    {
      path: z.string().optional().describe('Asset URL (db://assets/...)'),
      uuid: z.string().optional().describe('Asset UUID'),
    },
    async ({ path, uuid }) => {
      if (uuid) {
        const data = await bridge.send('asset', 'queryInfoByUuid', { uuid });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (path) {
        const data = await bridge.send('asset', 'getAssetInfoByUrl', { url: path });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      return { content: [{ type: 'text', text: 'Either path or uuid is required' }], isError: true };
    }
  );

  server.tool(
    'cc_create_asset',
    'Create a new asset',
    {
      path: z.string().describe('Asset URL to create (e.g. db://assets/scripts/foo.js)'),
      content: z.string().optional().describe('File content'),
    },
    async ({ path, content }) => {
      const data = await bridge.send('asset', 'createAsset', { url: path, content: content || '' });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_delete_asset',
    'Delete an asset',
    { path: z.string().describe('Asset URL to delete') },
    async ({ path }) => {
      const data = await bridge.send('asset', 'deleteAsset', { url: path });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_move_asset',
    'Move or rename an asset',
    {
      srcPath: z.string().describe('Source asset URL'),
      destPath: z.string().describe('Destination asset URL'),
    },
    async ({ srcPath, destPath }) => {
      const data = await bridge.send('asset', 'moveAsset', { srcUrl: srcPath, destUrl: destPath });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_read_script',
    'Read a script file content',
    {
      path: z.string().optional().describe('Script asset URL'),
      uuid: z.string().optional().describe('Script UUID'),
    },
    async (params) => {
      const data = await bridge.send('project', 'readScript', { url: params.path, uuid: params.uuid });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_write_script',
    'Write content to a script file',
    {
      path: z.string().describe('Script asset URL'),
      content: z.string().describe('Script content'),
    },
    async ({ path, content }) => {
      const data = await bridge.send('project', 'writeScript', { url: path, content });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_refresh_assets',
    'Refresh the asset database',
    { path: z.string().optional().describe('Asset path to refresh (default: all)') },
    async ({ path }) => {
      const data = await bridge.send('asset', 'refresh', { url: path });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
