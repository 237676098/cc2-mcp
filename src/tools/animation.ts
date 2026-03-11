import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';

export function registerAnimationTools(server: McpServer, bridge: BridgeClient) {
  // --- Read-only tools ---

  server.tool(
    'cc_list_animations',
    'List all .anim animation clip files in the project',
    {
      path: z.string().optional().describe('Asset directory to search (default: db://assets)'),
    },
    async ({ path }) => {
      const pattern = (path || 'db://assets') + '/**/*.anim';
      const data = await bridge.send('asset', 'queryAssets', { pattern, type: null });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_read_animation_clip',
    'Read and parse an .anim file, returning keyframe tracks',
    {
      path: z.string().optional().describe('Animation asset URL (db://assets/...)'),
      uuid: z.string().optional().describe('Animation asset UUID'),
    },
    async (params) => {
      const data = await bridge.send('project', 'readAnimClip', { url: params.path, uuid: params.uuid });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_node_animations',
    'Get Animation component info on a node (clips list, defaultClip, playing state)',
    {
      path: z.string().optional().describe('Node path (e.g. Canvas/player)'),
      uuid: z.string().optional().describe('Node UUID'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'getNodeAnimations', { path: params.path, uuid: params.uuid });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // --- Write tools ---

  server.tool(
    'cc_create_animation_clip',
    'Create a new .anim animation clip file',
    {
      path: z.string().describe('Asset URL for the new .anim file (e.g. db://assets/animations/fade_in.anim)'),
      name: z.string().describe('Clip name'),
      duration: z.number().describe('Clip duration in seconds'),
      sample: z.number().optional().describe('Sample rate (default: 60)'),
      speed: z.number().optional().describe('Playback speed (default: 1)'),
      wrapMode: z.number().optional().describe('Wrap mode: 0=Default, 1=Normal, 2=Loop, 22=PingPong (default: 1)'),
      curveData: z.record(z.any()).optional().describe('curveData object with paths/props/keyframes'),
    },
    async ({ path, name, duration, sample, speed, wrapMode, curveData }) => {
      const clip = [{
        __type__: 'cc.AnimationClip',
        _name: name,
        _duration: duration,
        sample: sample ?? 60,
        speed: speed ?? 1,
        wrapMode: wrapMode ?? 1,
        curveData: curveData || { paths: {} },
      }];
      const content = JSON.stringify(clip, null, 2);
      const data = await bridge.send('asset', 'createAsset', { url: path, content });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_edit_animation_clip',
    'Edit an existing .anim file (modify tracks, keyframes, duration, etc.)',
    {
      path: z.string().optional().describe('Animation asset URL (db://assets/...)'),
      uuid: z.string().optional().describe('Animation asset UUID'),
      duration: z.number().optional().describe('New duration'),
      sample: z.number().optional().describe('New sample rate'),
      speed: z.number().optional().describe('New playback speed'),
      wrapMode: z.number().optional().describe('New wrap mode'),
      curveData: z.record(z.any()).optional().describe('New curveData (replaces existing)'),
    },
    async (params) => {
      const data = await bridge.send('project', 'editAnimClip', {
        url: params.path,
        uuid: params.uuid,
        changes: {
          duration: params.duration,
          sample: params.sample,
          speed: params.speed,
          wrapMode: params.wrapMode,
          curveData: params.curveData,
        },
      });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_set_node_animation_clip',
    'Add, remove, or set default clip on a node\'s Animation component',
    {
      path: z.string().optional().describe('Node path'),
      uuid: z.string().optional().describe('Node UUID'),
      action: z.enum(['add', 'remove', 'setDefault']).describe('Action to perform'),
      clipUuid: z.string().describe('UUID of the animation clip asset'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'setNodeAnimationClip', {
        path: params.path,
        uuid: params.uuid,
        action: params.action,
        clipUuid: params.clipUuid,
      });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_play_animation',
    'Preview play/stop/pause/resume an animation on a node in the editor',
    {
      path: z.string().optional().describe('Node path'),
      uuid: z.string().optional().describe('Node UUID'),
      action: z.enum(['play', 'stop', 'pause', 'resume']).describe('Playback action'),
      clipName: z.string().optional().describe('Clip name to play (for play action, uses default if omitted)'),
    },
    async (params) => {
      const data = await bridge.send('scene', 'playAnimation', {
        path: params.path,
        uuid: params.uuid,
        action: params.action,
        clipName: params.clipName,
      });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
