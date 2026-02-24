# Giselle Agent Container

A unified SDK for running AI agents inside sandboxed containers with browser automation capabilities — like the [Vercel AI SDK](https://sdk.vercel.ai/), but for agentic CLI tools. Currently supports [Gemini CLI](https://github.com/google-gemini/gemini-cli) running in [Vercel Sandbox](https://vercel.com/docs/sandbox), with plans to support [Codex CLI](https://github.com/openai/codex) and other agents behind a single, consistent API and React UI layer.

A key use case is embedding a Chat UI into existing web applications to drive RPA-style form automation — the agent reasons about the page, and a custom MCP server relays DOM snapshots and actions between the sandbox and the user's browser via Redis.

## Architecture

```
┌────────────────────┐        ┌──────────────────┐        ┌──────────────────────┐
│  React App         │        │  Route Handler   │        │  Vercel Sandbox      │
│  ┌──────────────┐  │  POST  │                  │        │  ┌────────────────┐  │
│  │  useAgent()  │──┼───────▶│  runChat()       │───────▶│  │  Gemini CLI    │  │
│  │  hook        │◀─┼─NDJSON─│                  │◀stdout─│  │  (agent)       │  │
│  └──────────────┘  │        │                  │        │  └───────┬────────┘  │
│  ┌──────────────┐  │        │  ┌────────────┐  │        │          │ MCP       │
│  │  browserTool │◀─┼──SSE───│  │  Relay     │  │        │  ┌───────▼────────┐  │
│  │  (DOM ops)   │──┼──POST──│  │  Handler   │◀─┼─Redis──│  │  MCP Server    │  │
│  └──────────────┘  │        │  └────────────┘  │        │  │  (RelayClient) │  │
└────────────────────┘        └──────────────────┘        └──────────────────────┘
   Browser                       Your Server                  Sandboxed Container
```

### Sequence: Browser Tool Form Automation

```
Browser (React)           Route Handler            Redis              Sandbox (Gemini CLI + MCP)
     │                         │                     │                          │
     │─── POST agent.run ─────▶│                     │                          │
     │                         │── createRelaySession ▶│                         │
     │◀── NDJSON stream ───────│                     │                          │
     │    (relay.session)      │── runChat() ────────┼─────────────────────────▶│
     │                         │                     │                          │
     │◀── SSE (relay.events) ──│◀─── subscribe ──────│                          │
     │                         │                     │    MCP: getFormSnapshot   │
     │                         │                     │◀── relay.dispatch ───────│
     │                         │                     │── publish request ──────▶│
     │◀── snapshot_request ────│                     │                          │
     │                         │                     │                          │
     │  (DOM snapshot)         │                     │                          │
     │                         │                     │                          │
     │─── snapshot_response ──▶│── relay.respond ───▶│                          │
     │                         │                     │── publish response ─────▶│
     │                         │                     │                          │
     │                         │                     │  MCP: executeFormActions  │
     │                         │                     │◀── relay.dispatch ───────│
     │◀── execute_request ─────│                     │                          │
     │                         │                     │                          │
     │  (DOM mutations)        │                     │                          │
     │                         │                     │                          │
     │─── execute_response ───▶│── relay.respond ───▶│                          │
     │                         │                     │── publish response ─────▶│
     │                         │                     │                          │
     │◀── NDJSON (message) ────│◀─────── stdout ─────┼──────────────────────────│
     ▼                         ▼                     ▼                          ▼
```

## Project Structure

```
agent-container/
├── packages/
│   ├── sandbox-agent/          # @giselles-ai/sandbox-agent — core SDK
│   │   └── src/
│   │       ├── agents/         # Agent implementations (ChatAgent interface)
│   │       │   └── gemini-agent.ts
│   │       ├── client/         # Browser-side streaming client
│   │       │   └── stream-agent.ts
│   │       ├── react/          # React hook (useAgent)
│   │       │   └── use-agent.ts
│   │       ├── chat-run.ts     # Sandbox orchestrator (runChat)
│   │       └── index.ts
│   ├── browser-tool/           # @giselles-ai/browser-tool — browser automation
│   │   └── src/
│   │       ├── dom/            # Client-side DOM operations
│   │       │   ├── snapshot.ts # Scan form fields → SnapshotField[]
│   │       │   └── executor.ts # Apply actions → ExecutionReport
│   │       ├── mcp-server/     # MCP server (runs inside sandbox)
│   │       │   ├── relay-client.ts
│   │       │   └── tools/      # getFormSnapshot, executeFormActions
│   │       ├── react/          # React integration
│   │       │   ├── browser-tool.ts  # browserTool() relay handler
│   │       │   ├── provider.tsx
│   │       │   └── use-browser-tool.ts
│   │       ├── relay/          # Redis-backed relay (server-side)
│   │       │   ├── relay-handler.ts  # SSE + POST route handler
│   │       │   └── relay-store.ts    # Session management, pub/sub
│   │       └── types.ts        # Shared Zod schemas & types
│   └── web/                    # Next.js demo app
│       └── app/
│           ├── agent-api/
│           │   ├── run/route.ts           # Self-hosted agent endpoint
│           │   ├── external/run/route.ts  # Cloud API proxy endpoint
│           │   └── relay/[[...relay]]/route.ts  # Relay SSE + dispatch
│           ├── gemini-browser-tool/       # Self-hosted demo page
│           └── external-agent/            # Cloud API demo page
├── sandbox-agent/
│   ├── web/                    # Agent management platform
│   └── cli/                    # @giselles-ai/agent-cli
└── scripts/
```

## Packages

### `@giselles-ai/sandbox-agent`

The core SDK for running AI agents in Vercel Sandbox containers.

| Export Path | Description |
|---|---|
| `@giselles-ai/sandbox-agent` | Server-side — `ChatAgent` interface, `runChat()` orchestrator, `createGeminiAgent()` |
| `@giselles-ai/sandbox-agent/client` | Browser-side — `streamAgent()` async generator, `toNdjsonResponse()` helper |
| `@giselles-ai/sandbox-agent/react` | React — `useAgent()` hook with full state management |

#### `ChatAgent` Interface

All agent implementations conform to this interface, enabling future agents (Codex CLI, etc.) to be plugged in:

```ts
type ChatAgent<TRequest extends BaseChatRequest> = {
  requestSchema: z.ZodType<TRequest>;
  snapshotId?: string;
  prepareSandbox(input: { input: TRequest; sandbox: Sandbox }): Promise<void>;
  createCommand(input: { input: TRequest }): ChatCommand;
};
```

### `@giselles-ai/browser-tool`

Browser automation toolkit — DOM operations, MCP server, relay infrastructure.

| Export Path | Description |
|---|---|
| `@giselles-ai/browser-tool` | Shared types & Zod schemas (`SnapshotField`, `BrowserToolAction`, etc.) |
| `@giselles-ai/browser-tool/dom` | Client-side `snapshot()` and `execute()` functions |
| `@giselles-ai/browser-tool/react` | `browserTool()` relay handler, `BrowserToolProvider`, `useBrowserTool()` |
| `@giselles-ai/browser-tool/relay` | Server-side `createRelayHandler()`, `createRelaySession()` |
| `@giselles-ai/browser-tool/mcp-server` | MCP server entry point (runs inside sandbox) |

## Deployment Modes

### Self-Hosted

You run the full stack: Next.js app + Redis + Vercel Sandbox. The agent endpoint, relay handler, and browser tool all run in your infrastructure.

```ts
// app/agent-api/run/route.ts
import { createGeminiAgent, runChat } from "@giselles-ai/sandbox-agent";
import { createRelaySession } from "@giselles-ai/browser-tool/relay";

export async function POST(request: Request) {
  const session = await createRelaySession();
  const agent = createGeminiAgent({ snapshotId: "...", /* ... */ });
  return runChat({ agent, signal: request.signal, input: { /* ... */ } });
}
```

### Cloud API

Use the hosted Giselle API (`studio.giselles.ai`) — no Redis or snapshot setup needed. Your app proxies requests through `streamAgent()`:

```ts
// app/agent-api/external/run/route.ts
import { streamAgent, toNdjsonResponse } from "@giselles-ai/sandbox-agent/client";

export async function POST(request: Request) {
  return toNdjsonResponse(
    streamAgent({
      endpoint: "https://studio.giselles.ai/agent-api/run",
      message: "Fill out the form",
      headers: { authorization: "Bearer ..." },
    }),
  );
}
```

## Usage

### React Hook

```tsx
import { useAgent } from "@giselles-ai/sandbox-agent/react";
import { browserTool } from "@giselles-ai/browser-tool/react";

function Chat() {
  const { status, messages, tools, error, sendMessage } = useAgent({
    endpoint: "/agent-api/run",
    tools: {
      browserTool: browserTool(),  // Enable browser automation
    },
  });

  return (
    <div>
      {messages.map((m) => <p key={m.id}>{m.role}: {m.content}</p>)}
      <button onClick={() => sendMessage({ message: "Fill out the form" })}>
        Send
      </button>
    </div>
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

#### Required (self-hosted)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `SANDBOX_SNAPSHOT_ID` | Sandbox snapshot ID (see [Creating a Snapshot](#creating-a-snapshot)) |
| `REDIS_URL` | Redis connection URL for relay sessions |

#### Required (cloud API)

| Variable | Description |
|---|---|
| `EXTERNAL_AGENT_API_BEARER_TOKEN` | Bearer token for the Giselle cloud API |

#### Optional

| Variable | Description |
|---|---|
| `GISELLE_PROTECTION_PASSWORD` | App-level password protection |
| `VERCEL_PROTECTION_BYPASS` | Bypass Vercel preview deployment protection |
| `EXTERNAL_AGENT_API_PROTECTION_BYPASS` | Bypass protection on external API |

Redis URL is also read from these fallback env names: `REDIS_TLS_URL`, `KV_URL`, `UPSTASH_REDIS_TLS_URL`, `UPSTASH_REDIS_URL`.

## Creating a Snapshot

```bash
pnpm snapshot:browser-tool
```

Creates a Vercel Sandbox snapshot containing Gemini CLI and the built browser-tool MCP server. The script outputs the recommended values for `SANDBOX_SNAPSHOT_ID` and related env vars.

## Commands

| Command | Description |
|---|---|
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
