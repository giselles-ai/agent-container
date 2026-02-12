# AI RPA SDK MVP (Next.js Monorepo)

This repository contains a prototype for AI-driven form automation in a Next.js app.

- `packages/web`: Next.js demo app with AI SDK and Gemini CLI RPA channels
- `packages/rpa-planner`: shared planner (`instruction + fields -> actions`)
- `packages/mcp-server`: MCP server used by Gemini CLI
- `packages/mcp-smoke`: CLI smoke checker for MCP server (no Next.js required)
- `packages/rpa-sdk`: Browser-side SDK (`snapshot`, `execute`, React provider/panel)

## Prerequisites

- Node.js 20+
- pnpm 10+
- OpenAI API key
- Gemini API key
- `RPA_SANDBOX_SNAPSHOT_ID` (Vercel Sandbox snapshot that includes Gemini CLI + this repo)

## Setup

```bash
pnpm install
cp packages/web/.env.example packages/web/.env.local
# set required variables in packages/web/.env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Required env vars for the Gemini CLI + MCP + SSE path:

```bash
OPENAI_API_KEY=...
GEMINI_API_KEY=...
RPA_SANDBOX_SNAPSHOT_ID=...
REDIS_URL=...
```

Redis URL fallback env names are also supported:
`REDIS_TLS_URL`, `KV_URL`, `UPSTASH_REDIS_TLS_URL`, `UPSTASH_REDIS_URL`.

Optional sandbox resolution overrides:

```bash
RPA_SANDBOX_REPO_ROOT=/vercel/sandbox
RPA_MCP_SERVER_DIST_PATH=/vercel/sandbox/packages/mcp-server/dist/index.js
RPA_MCP_SERVER_CWD=/vercel/sandbox
RPA_SKIP_SANDBOX_BUILD=1
# Optional: pass through to sandbox MCP and send
# x-vercel-protection-bypass on bridge dispatch requests.
VERCEL_PROTECTION_BYPASS=...
```

## Create Sandbox Snapshot

Use the helper script to create a fresh snapshot containing:

- `gemini` CLI
- built `packages/rpa-planner/dist`
- built `packages/mcp-server/dist`

Prerequisites:

- Run `vercel link` and `vercel env pull` so the Sandbox SDK can authenticate.
- Ensure `OPENAI_API_KEY` and `GEMINI_API_KEY` are available in your shell.

Run:

```bash
pnpm snapshot:rpa
```

The script prints a new `snapshotId` and the recommended values for:

- `RPA_SANDBOX_SNAPSHOT_ID`
- `RPA_SANDBOX_REPO_ROOT`
- `RPA_MCP_SERVER_DIST_PATH`
- `RPA_MCP_SERVER_CWD`
- `RPA_SKIP_SANDBOX_BUILD=1`

Optional script controls:

```bash
RPA_SNAPSHOT_RUNTIME=node24
RPA_SNAPSHOT_TIMEOUT_MS=2700000
RPA_SANDBOX_ROOT=/vercel/sandbox
RPA_GEMINI_PACKAGE=@google/gemini-cli
```

## MCP CLI Smoke Check (No Next.js)

Use this to verify MCP discovery/tool call without starting the Next.js app.

```bash
pnpm mcp:check
```

What it does:

- Builds `@giselles/rpa-planner` and `@giselles/mcp-server`
- Starts a local mock bridge HTTP server
- Connects to `packages/mcp-server/dist/index.js` via MCP stdio client
- Runs `tools/list` and `fillForm`

Run against a real Vercel Sandbox snapshot:

```bash
pnpm mcp:check:sandbox
pnpm mcp:check:sandbox:discovery
```

Sandbox mode requires:

```bash
RPA_SANDBOX_SNAPSHOT_ID=...
```

Sandbox mode optional env:

```bash
RPA_SANDBOX_REPO_ROOT=/vercel/sandbox
RPA_MCP_SERVER_DIST_PATH=/vercel/sandbox/packages/mcp-server/dist/index.js
RPA_SANDBOX_SMOKE_TIMEOUT_MS=300000
RPA_SMOKE_KEEP_SANDBOX=1
```

Useful options:

```bash
pnpm mcp:check:discovery
pnpm mcp:check -- --instruction "Fill title with hello"
pnpm mcp:check -- --real-planner         # requires AI_GATEWAY_API_KEY or OPENAI_API_KEY
pnpm mcp:check -- --skip-build
pnpm mcp:check -- --mcp-path /absolute/path/to/packages/mcp-server/dist/index.js
pnpm mcp:check -- --target sandbox --mode discovery
```

By default the smoke checker sets `RPA_MCP_MOCK_PLAN=1` so `fillForm` can run without OpenAI.

## How the MVP works

1. Enter instruction and optional document in the prompt panel.
2. Click `Plan`.
3. SDK snapshots form fields from the DOM.
4. `/api/rpa` calls `ai` (`model: "openai/gpt-4o-mini"`) with structured output.
5. Review action plan, then click `Apply`.
6. SDK applies `fill` / `click` / `select` actions to the DOM.

## Manual E2E checks

1. `Fill title and body with a concise summary of the document.` with some document text fills both fields.
2. Add/select instructions to verify `select` action.
3. Use a fake field in instruction and confirm partial apply + warnings.
4. Confirm no DOM changes happen before `Apply`.
5. Open `/gemini-rpa` and verify Gemini tool calls trigger browser snapshot/execute through the bridge.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm format
pnpm snapshot:rpa
pnpm mcp:check
pnpm mcp:check:discovery
pnpm mcp:check:sandbox
pnpm mcp:check:sandbox:discovery
```

## Constraints in this MVP

- No auth / RBAC / audit log
- No streaming partial form fill
- No multi-page automation
- No automatic retry when selector lookup fails
