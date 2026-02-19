# Giselles Agent Container (Monorepo)

A monorepo for verifying automated form filling using Gemini CLI + MCP + Browser Bridge on Next.js.
Supports both Cloud mode and Self-hosted mode.

## Packages / Apps

- `packages/agent` — `@giselles-ai/agent` (Cloud mode client/proxy package)
  - Server: `handleAgentRunner({ apiKey?, baseUrl? }) -> { POST }`
  - Client: `useAgent()` (supports `bridgeUrl`)
- `packages/agent-self` — `@giselles-ai/agent-self` (Self-hosted package)
  - Server: `createAgentApiHandler() -> { GET, POST }`
  - React: Re-exports `@giselles-ai/agent/react`
- `packages/agent-core` — Internal package (private)
  - Redis bridge broker + Gemini chat handler
- `packages/browser-tool` — `@giselles-ai/browser-tool`
  - Types + Zod schemas
  - DOM operations (`snapshot` / `execute`)
  - MCP server (`./mcp-server` subpath export)
- `packages/web` — Cloud mode demo app
- `apps/cloud-api` — Cloud API service

## Prerequisites

- Node.js 20+
- pnpm 10+

## Setup

```bash
pnpm install
cp packages/web/.env.example packages/web/.env.local
# edit packages/web/.env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Cloud Mode (Recommended)

### Required env (demo app)

```bash
GISELLE_SANDBOX_AGENT_API_KEY=...
```

### Route handler (`@giselles-ai/agent`)

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
  apiKey: process.env.GISELLE_SANDBOX_AGENT_API_KEY!,
  baseUrl: "https://studio.giselles.ai/agent-api",
});

export const POST = handler.POST;
```

If `baseUrl` is not specified, `https://studio.giselles.ai/agent-api` is used as the default endpoint.

### Bridge behavior

- `POST /api/agent` (`agent.run`) is proxied through the user's Next.js to the Cloud API
- `bridge.events` (SSE) and `bridge.respond` connect directly to `bridge.session.bridgeUrl`

## Self-hosted Mode

### Required env

```bash
GEMINI_API_KEY=...
SANDBOX_SNAPSHOT_ID=...
REDIS_URL=...
```

Redis fallback env names:

- `REDIS_TLS_URL`
- `KV_URL`
- `UPSTASH_REDIS_TLS_URL`
- `UPSTASH_REDIS_URL`

### Route handler (`@giselles-ai/agent-self`)

```ts
import { createAgentApiHandler } from "@giselles-ai/agent-self";

export const runtime = "nodejs";

const handler = createAgentApiHandler({
  baseUrl: process.env.GISELLE_SANDBOX_AGENT_BASE_URL!,
});

export const GET = handler.GET;
export const POST = handler.POST;
```

`baseUrl` is optional. If not specified, the self-hosted route uses
`request.url.origin + request.url.pathname` (e.g., `https://localhost:3000/agent-api`) as the default.

### Self proxy routing (`@giselles-ai/agent`)

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
  baseUrl: "http://localhost:3000/agent-api",
});

export const POST = handler.POST;
```

## Client Hook

```ts
import { useAgent } from "@giselles-ai/agent/react";

const { status, messages, tools, error, sendMessage } = useAgent({
  endpoint: "/api/agent",
});
```

## Create Sandbox Snapshot

`pnpm snapshot:browser-tool` creates a snapshot containing:

- `gemini` CLI
- built `packages/browser-tool/dist/mcp-server/index.js`

The script output displays recommended values for:

- `SANDBOX_SNAPSHOT_ID`
- `BROWSER_TOOL_SANDBOX_REPO_ROOT`
- `BROWSER_TOOL_MCP_SERVER_DIST_PATH`
- `BROWSER_TOOL_MCP_SERVER_CWD`
- `BROWSER_TOOL_SKIP_SANDBOX_BUILD=1`

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm format
pnpm snapshot:browser-tool
pnpm sandbox:local:browser-tool
```
