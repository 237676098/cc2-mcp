# cc2-mcp

MCP Server for Cocos Creator 2.4.3+ editor — let AI assistants control scenes, nodes, components and assets via [Model Context Protocol](https://modelcontextprotocol.io/).

## Features

- **58 tools** covering scene, node, component, asset, animation, prefab, Spine, and UI operations
- **5 resources** for reading scene tree, project info, scene list and script list
- Works with any MCP-compatible client (Claude Desktop, Claude Code, etc.)

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- Cocos Creator 2.4.3+

## Installation

```bash
npm install -g cc2-mcp
```

## Setup

### 1. Install the CC Editor Extension

Copy the `cc-extension` folder from this package into your Cocos Creator project:

```bash
# Find the package location
npm root -g

# Copy cc-extension to your project
cp -r $(npm root -g)/cc2-mcp/cc-extension /path/to/your-cc-project/packages/cc2-mcp-bridge
```

Or manually copy `node_modules/cc2-mcp/cc-extension` to `<your-cc-project>/packages/cc2-mcp-bridge/`.

Then open (or restart) Cocos Creator — the extension will start a WebSocket server on port **9531**.

### 2. Configure your MCP Client

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cc2-mcp": {
      "command": "cc2-mcp"
    }
  }
}
```

#### Claude Code

Add to settings or `.mcp.json`:

```json
{
  "mcpServers": {
    "cc2-mcp": {
      "command": "cc2-mcp",
      "type": "stdio"
    }
  }
}
```

#### Using npx (no global install)

```json
{
  "mcpServers": {
    "cc2-mcp": {
      "command": "npx",
      "args": ["-y", "cc2-mcp"]
    }
  }
}
```

## How It Works

```
AI Client  ←—STDIO (JSON-RPC)—→  MCP Server  ←—WebSocket:9531—→  CC Editor Extension
                                  (this pkg)                       (cc-extension/)
```

The MCP Server communicates with the Cocos Creator editor extension via WebSocket. The extension runs inside the editor and has access to `cc.*` APIs for scene manipulation.

## Available Tools

| Category | Count | Examples |
|----------|-------|---------|
| Scene | 4 | get scene tree, open/save scene |
| Node | 8 | create, delete, move, duplicate nodes |
| Component | 5 | add/remove/configure components |
| Asset | 8 | list, create, delete, move assets |
| Project | 4 | project info, settings |
| Editor | 6 | console logs, selection, build, preview |
| Animation | 7 | create/edit animation clips, playback |
| Prefab | 5 | list, read, instantiate, create prefabs |
| Spine | 9 | skeleton info, bones, slots, skins, animations |
| UI | 9 | button, editbox, scrollview, layout, widget, etc. |

## License

MIT
