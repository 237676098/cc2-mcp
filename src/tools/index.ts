import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BridgeClient } from '../bridge/client.js';
import { registerSceneTools } from './scene.js';
import { registerNodeTools } from './node.js';
import { registerComponentTools } from './component.js';
import { registerAssetTools } from './asset.js';
import { registerProjectTools } from './project.js';
import { registerEditorTools } from './editor.js';
import { registerAnimationTools } from './animation.js';
import { registerPrefabTools } from './prefab.js';
import { registerSpineTools } from './spine.js';
import { registerUITools } from './ui.js';

export function registerTools(server: McpServer, bridge: BridgeClient) {
  registerSceneTools(server, bridge);
  registerNodeTools(server, bridge);
  registerComponentTools(server, bridge);
  registerAssetTools(server, bridge);
  registerProjectTools(server, bridge);
  registerEditorTools(server, bridge);
  registerAnimationTools(server, bridge);
  registerPrefabTools(server, bridge);
  registerSpineTools(server, bridge);
  registerUITools(server, bridge);
}
