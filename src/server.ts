import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BridgeClient } from './bridge/client.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';

export function createServer(): { server: McpServer; bridge: BridgeClient } {
  const bridge = new BridgeClient();

  const server = new McpServer({
    name: 'cc2-mcp',
    version: '1.0.0',
  });

  registerTools(server, bridge);
  registerResources(server, bridge);

  bridge.connect();

  return { server, bridge };
}
