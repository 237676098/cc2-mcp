import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

const nodeRef = {
  path: z.string().optional().describe('Node path (e.g. Canvas/player)'),
  uuid: z.string().optional().describe('Node UUID'),
};

export function registerNodeTools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    'cc_get_node',
    'Get node details by path or uuid',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'getNode', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_find_nodes',
    'Search nodes by name pattern (regex)',
    {
      pattern: z.string().describe('Regex pattern to match node names'),
      maxResults: z.number().optional().describe('Max results (default 50)'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'findNodes', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_create_node',
    'Create a new node',
    {
      parentPath: z.string().describe('Parent node path'),
      name: z.string().describe('New node name'),
      position: z.object({ x: z.number(), y: z.number() }).optional().describe('Initial position'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'createNode', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_delete_node',
    'Delete a node by path or uuid',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'deleteNode', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_set_node_property',
    'Set a node property (position, scale, anchor, size, color, name, active, opacity, rotation)',
    {
      ...nodeRef,
      property: z.string().describe('Property name'),
      value: z.unknown().describe('Property value'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setNodeProperty', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_move_node',
    'Move a node to a new parent',
    {
      sourcePath: z.string().optional().describe('Source node path'),
      sourceUuid: z.string().optional().describe('Source node UUID'),
      targetParentPath: z.string().describe('Target parent node path'),
      siblingIndex: z.number().optional().describe('Position among siblings'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'moveNode', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_duplicate_node',
    'Duplicate a node',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'duplicateNode', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_node_children',
    'Get the children of a node',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'getNodeChildren', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}