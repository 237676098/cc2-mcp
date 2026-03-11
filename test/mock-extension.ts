/**
 * Mock WebSocket server that simulates the CC extension for testing.
 * Usage: npx ts-node test/mock-extension.ts
 */
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 9531;

const mockSceneTree = {
  name: 'Scene',
  uuid: 'scene-root-uuid',
  path: '',
  active: true,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0.5, y: 0.5 },
  size: { width: 960, height: 640 },
  opacity: 255,
  color: null,
  childCount: 1,
  components: [],
  children: [
    {
      name: 'Canvas',
      uuid: 'canvas-uuid',
      path: 'Canvas',
      active: true,
      position: { x: 480, y: 320 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      size: { width: 960, height: 640 },
      opacity: 255,
      color: null,
      childCount: 1,
      components: ['cc.Canvas', 'cc.Widget'],
      children: [
        {
          name: 'Label',
          uuid: 'label-uuid',
          path: 'Canvas/Label',
          active: true,
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          size: { width: 200, height: 50 },
          opacity: 255,
          color: { r: 255, g: 255, b: 255, a: 255 },
          childCount: 0,
          components: ['cc.Label'],
        },
      ],
    },
  ],
};

const mockProjectInfo = {
  path: '/mock/project',
  name: 'MockProject',
  engineVersion: '2.4.3',
};

const mockScenes = [
  { url: 'db://assets/scenes/main.fire', uuid: 'scene-uuid-1' },
  { url: 'db://assets/scenes/game.fire', uuid: 'scene-uuid-2' },
];

interface BridgeRequest {
  id: string;
  type: 'request';
  domain: string;
  method: string;
  params: Record<string, unknown>;
}

function handleRequest(req: BridgeRequest): unknown {
  const { domain, method } = req;

  if (domain === 'scene') {
    switch (method) {
      case 'getSceneTree': return mockSceneTree;
      case 'getCurrentSceneInfo':
        return { name: 'Scene', uuid: 'scene-root-uuid', childCount: 1 };
      case 'getNode': return mockSceneTree.children[0];
      case 'findNodes': return [mockSceneTree.children[0].children![0]];
      case 'getNodeChildren': return mockSceneTree.children;
      case 'createNode':
        return { name: req.params.name, uuid: 'new-uuid', path: req.params.parentPath + '/' + req.params.name };
      case 'deleteNode': return { success: true };
      case 'setNodeProperty': return mockSceneTree.children[0];
      case 'moveNode': return mockSceneTree.children[0];
      case 'duplicateNode': return { ...mockSceneTree.children[0], uuid: 'dup-uuid', name: 'Canvas (copy)' };
      case 'getComponents':
        return [{ type: 'cc.Canvas', uuid: 'comp-1', enabled: true, properties: {} }];
      case 'getComponent':
        return { type: 'cc.Canvas', uuid: 'comp-1', enabled: true, properties: {} };
      case 'addComponent':
        return { type: req.params.componentType, uuid: 'new-comp', enabled: true, properties: {} };
      case 'removeComponent': return { success: true };
      case 'setComponentProperty':
        return { type: req.params.componentType, uuid: 'comp-1', enabled: true, properties: {} };
    }
  }

  if (domain === 'project') {
    switch (method) {
      case 'getInfo': return mockProjectInfo;
      case 'listScenes': return mockScenes;
      case 'listScripts': return [{ url: 'db://assets/scripts/main.js', uuid: 'script-1' }];
      case 'getSettings': return { designWidth: 960, designHeight: 640 };
      case 'readScript': return { path: '/mock/assets/scripts/main.js', content: '// mock script' };
      case 'writeScript': return { success: true };
    }
  }

  if (domain === 'asset') {
    switch (method) {
      case 'queryAssets': return [{ url: 'db://assets/texture.png', uuid: 'tex-1', type: 'texture' }];
      case 'queryInfoByUuid': return { url: 'db://assets/texture.png', uuid: req.params.uuid, type: 'texture' };
      case 'queryUuidByUrl': return { uuid: 'tex-1' };
      case 'createAsset': return { success: true };
      case 'deleteAsset': return { success: true };
      case 'moveAsset': return { success: true };
      case 'refresh': return { success: true };
    }
  }

  if (domain === 'editor') {
    switch (method) {
      case 'getConsoleLogs': return [{ level: 'log', message: 'Hello', timestamp: Date.now() }];
      case 'logMessage': return { success: true };
      case 'getSelection': return { type: 'node', uuids: [] };
      case 'setSelection': return { success: true };
      case 'buildProject': return { success: true, message: 'Build started' };
      case 'previewProject': return { success: true, message: 'Preview started' };
    }
  }

  throw new Error(`Unknown: ${domain}.${method}`);
}

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
console.log(`Mock CC extension listening on ws://127.0.0.1:${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('MCP Server connected');
  ws.on('message', (raw: Buffer) => {
    const req: BridgeRequest = JSON.parse(raw.toString());
    try {
      const data = handleRequest(req);
      ws.send(JSON.stringify({ id: req.id, type: 'response', success: true, data }));
    } catch (e: any) {
      ws.send(JSON.stringify({ id: req.id, type: 'response', success: false, error: { code: 'MOCK_ERROR', message: e.message } }));
    }
  });
});
