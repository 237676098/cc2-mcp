import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

const nodeRef = {
  path: z.string().optional().describe('Node path (e.g. Canvas/spineNode)'),
  uuid: z.string().optional().describe('Node UUID'),
};

export function registerSpineTools(server: McpServer, bridge: BridgeClient) {
  // --- Read-only tools ---

  server.tool(
    'cc_get_spine_info',
    'Get sp.Skeleton component info (skeletonData, skin, animation, loop, timeScale)',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'getSpineInfo', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_spine_bones',
    'List all bones in a Spine skeleton (name, parent, position, rotation, scale)',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'getSpineBones', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_spine_slots',
    'List all slots in a Spine skeleton (name, bone, attachment)',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'getSpineSlots', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_spine_animations',
    'List all available animation names in a Spine skeleton',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'getSpineAnimations', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_spine_skins',
    'List all available skin names in a Spine skeleton',
    nodeRef,
    async (params) => {
      const data = await bridge.send('scene', 'getSpineSkins', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // --- Write tools ---

  server.tool(
    'cc_set_spine_property',
    'Set properties on sp.Skeleton (skeletonData via UUID, defaultSkin, animation, loop, timeScale, etc.)',
    {
      ...nodeRef,
      properties: z.object({
        skeletonData: z.union([z.string(), z.object({ uuid: z.string() }), z.null()]).optional()
          .describe('SkeletonData asset UUID string or {uuid} object, or null to clear'),
        defaultSkin: z.string().optional().describe('Default skin name'),
        defaultAnimation: z.string().optional().describe('Default animation name'),
        animation: z.string().optional().describe('Current animation name'),
        loop: z.boolean().optional().describe('Loop animation'),
        premultipliedAlpha: z.boolean().optional().describe('Premultiplied alpha'),
        timeScale: z.number().optional().describe('Animation time scale'),
        paused: z.boolean().optional().describe('Pause animation'),
      }).describe('Properties to set'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setSpineProperty', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_spine_set_animation',
    'Set animation on a Spine skeleton track (setAnimation)',
    {
      ...nodeRef,
      track: z.number().optional().describe('Track index (default: 0)'),
      name: z.string().describe('Animation name'),
      loop: z.boolean().optional().describe('Loop animation (default: false)'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'spineSetAnimation', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_spine_add_animation',
    'Queue an animation on a Spine skeleton track (addAnimation)',
    {
      ...nodeRef,
      track: z.number().optional().describe('Track index (default: 0)'),
      name: z.string().describe('Animation name'),
      loop: z.boolean().optional().describe('Loop animation (default: false)'),
      delay: z.number().optional().describe('Delay in seconds before playing (default: 0)'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'spineAddAnimation', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_spine_set_skin',
    'Set active skin on a Spine skeleton',
    {
      ...nodeRef,
      skinName: z.string().describe('Skin name to activate'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'spineSetSkin', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
