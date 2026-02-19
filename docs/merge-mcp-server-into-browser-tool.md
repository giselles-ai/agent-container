# Merging mcp-server into browser-tool

## Background

### Discussion in discussion #5310

In [route06/giselle-division#5310](https://github.com/route06/giselle-division/discussions/5310), we discussed restructuring the browser-tool packages. The decision was to dismantle the three legacy packages (`browser-tool-sdk`, `browser-tool-bridge`, `browser-tool-planner`) and reorganize into the following structure.

| Package | Role |
|---|---|
| `@giselles-ai/agent` | `handleAgentRunner()` + BridgeBroker + Sandbox management (server), `useAgent()` hook (React) |
| `@giselles-ai/browser-tool` | Type definitions / Zod schemas, snapshot/execute via `/dom`, planActions via `/planner` |
| `@giselles/mcp-server` (internal) | MCP process running inside the Sandbox |

This restructuring was implemented in [PR #3](https://github.com/giselles-ai/agent-container/pull/3).

### Current position of mcp-server

The discussion concluded with keeping `mcp-server` as an independent "internal package." However, after implementation, the independence of this package feels questionable.

**Current contents of `packages/mcp-server`:**

- `src/index.ts` — MCP server startup (registers only one `fillForm` tool)
- `src/bridge-client.ts` — BridgeClient class that sends HTTP requests to the Bridge
- `src/tools/fill-form.ts` — Orchestration of snapshot → plan → execute

**Dependencies:**

- Imports types and Zod schemas from `@giselles-ai/browser-tool`
- Dynamically imports `@giselles-ai/browser-tool/planner/runtime` inside the Sandbox
- Implements the MCP protocol using `@modelcontextprotocol/sdk`

In other words, mcp-server is an adapter that exposes browser-tool's "browser operations" via the MCP protocol, and is tightly coupled with browser-tool.

## Why merge

1. **Consistency of responsibility** — The `fillForm` tool provided by mcp-server orchestrates browser-tool's snapshot/execute/planner. It naturally belongs as part of browser operations within browser-tool.

2. **Fewer packages** — Having a private internal package as a separate entity increases complexity in surrounding code: build order management, path specification in snapshot scripts, directory discovery in chat-handler, etc.

3. **Alignment with existing patterns** — browser-tool already provides `/dom` and `/planner` via subpath exports. Adding `/mcp-server` is a natural extension of the existing pattern.

4. **Structural similarity to planner** — planner is also server-side-only code that is dynamically imported inside the Sandbox, yet it works fine as a subpath of browser-tool. mcp-server can be handled the same way.

## Structure after merging

```text
packages/
├── agent/         @giselles-ai/agent
├── browser-tool/  @giselles-ai/browser-tool   ← absorbs mcp-server
└── web/           demo app
```

### browser-tool subpath exports

```text
@giselles-ai/browser-tool           → Type definitions, Zod schemas (environment-agnostic)
@giselles-ai/browser-tool/dom       → snapshot(), execute() (in-browser)
@giselles-ai/browser-tool/planner   → planActions() (server / Sandbox)
@giselles-ai/browser-tool/mcp-server → MCP server entry point (inside Sandbox)
```

### File layout

```text
packages/browser-tool/src/
├── index.ts              (types + schemas)
├── types.ts
├── dom/
│   └── index.ts          (snapshot, execute)
├── planner/
│   └── index.ts          (planActions)
└── mcp-server/
    ├── index.ts           ← former mcp-server/src/index.ts
    ├── bridge-client.ts   ← former mcp-server/src/bridge-client.ts
    └── tools/
        └── fill-form.ts   ← former mcp-server/src/tools/fill-form.ts
```

## Implementation steps

### 1. Move source files

Move the files under `packages/mcp-server/src/` to `packages/browser-tool/src/mcp-server/`.

- `src/index.ts` → `src/mcp-server/index.ts`
- `src/bridge-client.ts` → `src/mcp-server/bridge-client.ts`
- `src/tools/fill-form.ts` → `src/mcp-server/tools/fill-form.ts`

Change `@giselles-ai/browser-tool` import paths to relative paths (since they are now within the same package).

### 2. Update browser-tool package.json

Add `./mcp-server` to `exports`, and add `bin` and dependencies.

```jsonc
{
  "bin": {
    "giselles-mcp-server": "./dist/mcp-server/index.js"
  },
  "exports": {
    // Existing entries unchanged
    "./mcp-server": {
      "types": "./dist/mcp-server/index.d.ts",
      "import": "./dist/mcp-server/index.js",
      "default": "./dist/mcp-server/index.js"
    }
  },
  "dependencies": {
    // Add to existing
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

### 3. Add build entry to tsup.ts

```ts
{
  entry: ["src/mcp-server/index.ts"],
  outDir: "dist/mcp-server",
  format: ["esm"],
  dts: true,
  clean: false,
},
```

### 4. Update path references

Update path references to `packages/mcp-server` in the following files to use the `packages/browser-tool` base.

#### `packages/agent/src/internal/chat-handler.ts`

- Change `packages/mcp-server` directory lookup → `packages/browser-tool`
- `mcpServerDistPath` → `${repoRoot}/packages/browser-tool/dist/mcp-server/index.js`
- Remove `@giselles/mcp-server` build command (now included in browser-tool build)

#### `scripts/prepare-local-browser-tool-sandbox.mjs`

- Remove `--filter @giselles/mcp-server` (covered by browser-tool build)
- `packages/mcp-server/dist/index.js` → `packages/browser-tool/dist/mcp-server/index.js`

#### `packages/web/scripts/create-browser-tool-snapshot.mjs`

- Remove `"packages/mcp-server"` from `INCLUDE_PATHS`
- Remove `--filter @giselles/mcp-server`
- Update dist path references

### 5. Update planner import path in fill-form.ts

The current `fill-form.ts` dynamically imports the planner using an absolute path:

```ts
const PLANNER_RUNTIME_DIST_PATH =
  "/vercel/sandbox/packages/browser-tool/dist/planner/index.js";
```

No change needed (the planner dist path remains the same).

### 6. Delete the packages/mcp-server directory

After all references are updated, delete `packages/mcp-server/`.

### 7. Update docs/restructure-plan.md

Remove the `mcp-server` line from the package structure description and add `./mcp-server` to the browser-tool subpath list.

## Verification

All of the following must pass:

```bash
pnpm --filter @giselles-ai/browser-tool build
pnpm --filter @giselles-ai/agent build
pnpm typecheck
```

- `dist/mcp-server/index.js` is generated and `node dist/mcp-server/index.js` starts the MCP server
- The MCP server inside the Sandbox is correctly referenced from chat-handler
- The snapshot → plan → execute E2E flow works

## Summary of impact

| Target | Change |
|---|---|
| `packages/browser-tool/src/mcp-server/` | Newly added (moved from mcp-server) |
| `packages/browser-tool/package.json` | Added exports, bin, dependencies |
| `packages/browser-tool/tsup.ts` | Added build entry |
| `packages/agent/src/internal/chat-handler.ts` | Updated path references, simplified build commands |
| `scripts/prepare-local-browser-tool-sandbox.mjs` | Updated path references, simplified filter |
| `packages/web/scripts/create-browser-tool-snapshot.mjs` | Updated path references, simplified filter |
| `docs/restructure-plan.md` | Updated package structure description |
| `README.md` | Updated package list description |
| `packages/mcp-server/` | Deleted |
