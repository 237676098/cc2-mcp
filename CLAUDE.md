# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # Compile TypeScript (uses --max-old-space-size=4096)
npm run dev            # Watch mode (tsc --watch)
npm run start          # Run compiled server: node dist/index.js
npm test               # Run tests: vitest --run
```

Install extension into a Cocos Creator project:
```bash
npx ts-node scripts/install-extension.ts <cocos-project-path>
```

Run mock server for local testing without Cocos Creator:
```bash
npx ts-node test/mock-extension.ts
```

## Architecture

MCP Server for Cocos Creator 2.4.3+ editor. AI assistants communicate via STDIO (JSON-RPC) → MCP Server (TypeScript/ESM) → WebSocket bridge → CC extension (CommonJS/plain JS) running inside the editor.

```
AI Client ──STDIO──▶ MCP Server (src/) ──WebSocket:9531──▶ CC Extension (cc-extension/)
```

**MCP Server (`src/`)** — TypeScript, ESM (`"type": "module"`, module: Node16). Entry point `index.ts` creates STDIO transport; `server.ts` creates McpServer and registers 28 tools + 5 resources.

**Bridge (`src/bridge/`)** — WebSocket client with auto-reconnect (exponential backoff 1s→30s), heartbeat (15s), and a request queue using UUID correlation IDs. Protocol defines 4 domains: `scene`, `asset`, `project`, `editor`. Default timeout 30s, build timeout 120s.

**Tools (`src/tools/`)** — Organized by domain: scene (4), node (8), component (5), asset (8), project (4), editor (6). All use Zod schemas for parameter validation. Nodes are identified by `path` (e.g. "Canvas/player") or `uuid`. Assets use `db://assets/...` URLs.

**CC Extension (`cc-extension/`)** — Runs inside Cocos Creator. `main.js` hosts the WS server and routes by domain. Scene-domain calls delegate to `scene-walker.js` via `Editor.Scene.callSceneScript()` (runs in render process with `cc.*` API access). `serializer.js` handles circular references and CC types (Vec2, Vec3, Size, Rect, Color).

## Code Conventions

- All local `.ts` imports must use `.js` extension (ESM requirement)
- `skipLibCheck: true` in tsconfig is required (MCP SDK Zod types are heavy)
- `cc-extension/` is plain JavaScript (CommonJS), excluded from tsc compilation
- `scene-walker.js` runs in a different process (scene render) — no direct Node.js APIs available there
- Tool handler pattern: each file exports a `register*Tools(server, bridge)` function
