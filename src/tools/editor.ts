import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeClient } from '../bridge/client.js';
import { BUILD_TIMEOUT } from '../bridge/protocol.js';

export function registerEditorTools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    'cc_get_console_logs',
    'Get recent console log messages',
    {
      count: z.number().optional().describe('Number of logs to return (default 50)'),
      level: z.string().optional().describe('Filter by level: log, warn, error'),
    },
    async (params) => {
      const data = await bridge.send('editor', 'getConsoleLogs', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_log_message',
    'Send a message to the editor console',
    {
      message: z.string().describe('Message text'),
      level: z.enum(['log', 'warn', 'error']).optional().describe('Log level (default: log)'),
    },
    async (params) => {
      const data = await bridge.send('editor', 'logMessage', params);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_get_selection',
    'Get currently selected nodes in the editor',
    {},
    async () => {
      const data = await bridge.send('editor', 'getSelection', {});
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_set_selection',
    'Set the editor selection',
    { uuids: z.array(z.string()).describe('Array of node UUIDs to select') },
    async ({ uuids }) => {
      const data = await bridge.send('editor', 'setSelection', { uuids });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_build_project',
    'Trigger a project build',
    {
      platform: z.string().describe('Target platform (web-mobile, web-desktop, android, ios, etc.)'),
      buildPath: z.string().optional().describe('Build output path (default: build)'),
    },
    async (params) => {
      const data = await bridge.send('editor', 'buildProject', params, BUILD_TIMEOUT);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'cc_preview_project',
    'Start project preview in browser',
    { browser: z.string().optional().describe('Browser to open (default: system default)') },
    async ({ browser }) => {
      const data = await bridge.send('editor', 'previewProject', { browser });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
