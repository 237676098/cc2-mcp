import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BridgeClient } from '../bridge/client.js';

export function registerResources(server: McpServer, bridge: BridgeClient) {
  server.resource(
    'scene-tree',
    'cc://scene/tree',
    { description: 'Current scene node tree', mimeType: 'application/json' },
    async () => {
      const data = await bridge.send('scene', 'getSceneTree', {});
      return { contents: [{ uri: 'cc://scene/tree', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }] };
    }
  );

  server.resource(
    'scene-info',
    'cc://scene/info',
    { description: 'Current scene metadata', mimeType: 'application/json' },
    async () => {
      const data = await bridge.send('scene', 'getCurrentSceneInfo');
      return { contents: [{ uri: 'cc://scene/info', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }] };
    }
  );

  server.resource(
    'project-info',
    'cc://project/info',
    { description: 'Project information', mimeType: 'application/json' },
    async () => {
      const data = await bridge.send('project', 'getInfo');
      return { contents: [{ uri: 'cc://project/info', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }] };
    }
  );

  server.resource(
    'project-scenes',
    'cc://project/scenes',
    { description: 'List of scene files', mimeType: 'application/json' },
    async () => {
      const data = await bridge.send('project', 'listScenes');
      return { contents: [{ uri: 'cc://project/scenes', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }] };
    }
  );

  server.resource(
    'project-scripts',
    'cc://project/scripts',
    { description: 'List of script files', mimeType: 'application/json' },
    async () => {
      const data = await bridge.send('project', 'listScripts', {});
      return { contents: [{ uri: 'cc://project/scripts', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }] };
    }
  );
}
