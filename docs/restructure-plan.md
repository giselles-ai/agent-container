# browser-tool Restructuring — Final Implementation Plan

## Decisions

1. No compatibility layer (breaking migration).
2. Unify to a single API route.
   - `POST /api/agent` (`agent.run` / `bridge.dispatch` / `bridge.respond`)
   - `GET /api/agent?type=bridge.events&sessionId&token`
3. planner is bundled within `@giselles-ai/browser-tool`.
4. `packages/web` migrates `/gemini-browser-tool` to `useAgent`, and `/` becomes a simple landing page.

## Final Package Structure

```text
packages/
├── agent/         @giselles-ai/agent
├── browser-tool/  @giselles-ai/browser-tool
└── web/           demo app
```

Deleted:

- `packages/browser-tool-sdk`
- `packages/browser-tool-bridge`
- `packages/browser-tool-planner`

## Public API

### `@giselles-ai/browser-tool`

- `.`: Types + Zod schemas
- `./dom`: `snapshot`, `execute`
- `./planner`: `planActions`
- `./planner/runtime`: Alias for runtime import
- `./mcp-server`: MCP server entry point for sandbox

### `@giselles-ai/agent`

- `.`: `handleAgentRunner`
- `./react`: `useAgent`, `BrowserToolProvider`, `PromptPanel`, `useBrowserTool`

## Route Handler

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({ tools: { browser: true } });
export const GET = handler.GET;
export const POST = handler.POST;
```

## Data Flow

1. `useAgent().sendMessage()` calls `POST /api/agent` (`type: "agent.run"`).
2. The server creates a bridge session and returns `bridge.session` at the head of the NDJSON stream.
3. The client automatically connects to `GET /api/agent?type=bridge.events...`.
4. Executes `snapshot_request` / `execute_request` from SSE against the DOM and returns results via `bridge.respond`.
5. The sandbox MCP (`@giselles-ai/browser-tool/mcp-server`) calls `bridge.dispatch`, and planner dynamically imports `@giselles-ai/browser-tool/planner/runtime`.

## mcp-server Integration Changes

- Deprecated the former mcp-server package and merged it into `@giselles-ai/browser-tool/mcp-server`
- Added `./mcp-server` to browser-tool's subpath exports
- Unified sandbox-side dist references to `packages/browser-tool/dist/mcp-server/index.js`

## web Changes

- Added: `app/api/agent/route.ts`
- Deleted: `app/api/gemini-browser-tool/[...slug]/route.ts`, `app/api/browser-tool/route.ts`, `app/api/chat/route.ts`
- Migrated `app/gemini-browser-tool/page.tsx` from `useBridge` to `useAgent`
- Simplified `app/page.tsx` to a landing page
- Updated snapshot creation script to use `browser-tool` base

## Acceptance Criteria

- `pnpm --filter @giselles-ai/browser-tool build`
- `pnpm --filter @giselles-ai/agent build`
- `pnpm --filter demo build`
- `pnpm typecheck`

All above must pass, and the snapshot → plan → execute round trip must work on `/gemini-browser-tool`.
