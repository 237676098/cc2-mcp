import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

const compRef = {
  path: z.string().optional().describe('Node path'),
  uuid: z.string().optional().describe('Node UUID'),
  componentType: z.string().describe('Component class name (e.g. cc.Sprite, cc.Label)'),
};

export function registerComponentTools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    'cc_get_components',
    'List all components on a node',
    { path: z.string().optional(), uuid: z.string().optional() },
    async (params) => {
      const data = await bridge.send('scene', 'getComponents', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_component',
    'Get detailed properties of a specific component',
    compRef,
    async (params) => {
      const data = await bridge.send('scene', 'getComponent', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_add_component',
    'Add a component to a node',
    compRef,
    async (params) => {
      const data = await bridge.send('scene', 'addComponent', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_remove_component',
    'Remove a component from a node',
    compRef,
    async (params) => {
      const data = await bridge.send('scene', 'removeComponent', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_set_component_property',
    'Set a property on a component',
    {
      ...compRef,
      property: z.string().describe('Property name'),
      value: z.unknown().describe('Property value'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setComponentProperty', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
