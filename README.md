# Giselle Agent Container

A monorepo for running AI agents inside sandboxed containers with browser automation capabilities. Agents run [Gemini CLI](https://github.com/google-gemini/gemini-cli) in a [Vercel Sandbox](https://vercel.com/docs/sandbox), communicate via a Redis-backed bridge, and can interact with the user's browser through an MCP server.

## Architecture

```
┌─────────────┐       ┌──────────────────┐       ┌──────────────────────┐
│  React App  │──────▶│  Cloud API /     │──────▶│  Vercel Sandbox      │
│  (useAgent) │  POST │  Route Handler   │       │  ┌────────────────┐  │
│             │◀─SSE──│  (bridge-broker) │◀─────▶│  │  Gemini CLI    │  │
│             │       └──────────────────┘ Redis  │  │  + MCP Server  │  │
│  ┌────────┐ │              ▲                    │  └────────────────┘  │
│  │Browser │ │              │ bridge              └──────────────────────┘
│  │  Tool  │─┼──────────────┘
│  │  DOM   │ │  snapshot / execute
│  └────────┘ │
└─────────────┘
```

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@giselles-ai/sandbox-agent` | `packages/sandbox-agent` | Client SDK — `handleAgentRunner()` route handler + `useAgent()` React hook |
| `@giselles-ai/sandbox-agent-core` | `packages/agent-core` | Server internals — Redis bridge broker, bridge handler, Gemini chat handler |
| `@giselles-ai/browser-tool` | `packages/browser-tool` | Browser tool types/schemas, DOM operations (`snapshot`/`execute`), MCP server |

## Apps

| App | Path | Description |
|-----|------|-------------|
| Demo (self-hosted) | `packages/web` | Next.js demo app with full self-hosted agent + browser tool |
| Cloud API Demo | `demo/cloud-api` | Next.js demo using the cloud API service |
| Agent Platform | `sandbox-agent/web` | Agent management platform — create, configure, and run agents |
| `@giselles-ai/agent-cli` | `sandbox-agent/cli` | CLI tool (`giselle`) for creating and managing agents |

## Prerequisites

- Node.js 20+
- pnpm 10+

## Getting Started

```bash
pnpm install
```

### Run the demo app

```bash
cp packages/web/.env.example packages/web/.env.local
# Fill in the required environment variables (see below)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

#### Required

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `SANDBOX_SNAPSHOT_ID` | Sandbox snapshot ID (see [Creating a Snapshot](#creating-a-snapshot)) |
| `REDIS_URL` | Redis connection URL for bridge sessions |

#### Optional

| Variable | Description |
|----------|-------------|
| `GISELLE_SANDBOX_AGENT_API_KEY` | API key for cloud mode authentication |
| `GISELLE_SANDBOX_AGENT_BASE_URL` | Override the default cloud API endpoint |
| `GISELLE_PROTECTION_PASSWORD` | App-level password protection |
| `VERCEL_PROTECTION_BYPASS` | Bypass Vercel preview deployment protection |

Redis URL is also read from these fallback env names: `REDIS_TLS_URL`, `KV_URL`, `UPSTASH_REDIS_TLS_URL`, `UPSTASH_REDIS_URL`.

## Usage

### Route Handler

```ts
import { handleAgentRunner } from "@giselles-ai/sandbox-agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
  apiKey: process.env.GISELLE_SANDBOX_AGENT_API_KEY!,
  baseUrl: "https://studio.giselles.ai/agent-api", // default
});

export const POST = handler.POST;
```

### React Hook

```tsx
import { useAgent } from "@giselles-ai/sandbox-agent/react";

function Chat() {
  const { status, messages, tools, error, sendMessage } = useAgent({
    endpoint: "/api/agent",
  });

  return (
    <button onClick={() => sendMessage({ message: "Fill out the form" })}>
      Send
    </button>
  );
}
```

### CLI

```bash
npx @giselles-ai/agent-cli create
npx @giselles-ai/agent-cli add-skill <path>
npx @giselles-ai/agent-cli add-hosted-skill <slug>
npx @giselles-ai/agent-cli edit-setup-script
npx @giselles-ai/agent-cli build
npx @giselles-ai/agent-cli delete [slug] [--force]
```

## Creating a Snapshot

```bash
pnpm snapshot:browser-tool
```

Creates a Vercel Sandbox snapshot containing Gemini CLI and the built browser-tool MCP server. The script outputs the recommended values for `SANDBOX_SNAPSHOT_ID` and related env vars.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the demo app |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm format` | Format with Biome |
| `pnpm snapshot:browser-tool` | Create a sandbox snapshot |
| `pnpm sandbox:local:browser-tool` | Prepare local sandbox environment |
| `pnpm mcp:check` | Run MCP smoke tests |
| `pnpm knip` | Check for unused exports/dependencies |
| `pnpm cli:release` | Release the CLI package |

## License

[Apache-2.0](LICENSE)
