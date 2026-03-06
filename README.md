# Giselle Agent Container

Run CLI-based AI agents (like [Gemini CLI](https://github.com/google-gemini/gemini-cli)) inside sandboxed containers and communicate with them through the [Vercel AI SDK](https://sdk.vercel.ai/) protocol. The custom `LanguageModelV3` provider translates the agent's NDJSON output into standard AI SDK streams, so your React app can use `useChat` and `streamText` as if it were talking to any other LLM — while the actual work is done by a CLI agent running in a [Vercel Sandbox](https://vercel.com/docs/sandbox).

A key use case is RPA-style form automation: the sandboxed agent reasons about a page via an MCP server, and browser-tool operations flow through the AI SDK's `onToolCall` mechanism to snapshot DOM state and execute actions directly in the user's browser.

## Architecture

```
┌────────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
│  React App         │        │  Your Server         │        │  Vercel Sandbox      │
│  ┌──────────────┐  │  POST  │  ┌────────────────┐  │        │  ┌────────────────┐  │
│  │  useChat()   │──┼───────▶│  │  streamText()  │  │        │  │  Gemini CLI    │  │
│  │  (@ai-sdk)   │◀─┼─stream─│  │  + giselle()   │──┼─NDJSON▶│  │  (CLI agent)   │  │
│  └──────────────┘  │        │  │  (provider)    │◀─┼─NDJSON─│  │                │  │
│                    │        │  └────────────────┘  │        │  └───────┬────────┘  │
│  ┌──────────────┐  │        │                      │        │          │ MCP       │
│  │  onToolCall  │  │        │  ┌────────────────┐  │        │  ┌───────▼────────┐  │
│  │  (DOM ops)   │  │        │  │  Session Mgr   │◀─┼─Redis──│  │  MCP Server    │  │
│  └──────────────┘  │        │  └────────────────┘  │        │  └────────────────┘  │
└────────────────────┘        └──────────────────────┘        └──────────────────────┘
   Browser                       Route Handler                   Sandboxed Container
```

The `giselle-provider` package is the bridge: it wraps the Cloud API (which orchestrates the sandbox) as a `LanguageModelV3`, so the NDJSON stream from the CLI agent is translated into AI SDK stream parts that `useChat` understands natively.

### Sequence: Browser Tool Form Automation

```
Browser (useChat)             Route Handler            Redis              Sandbox (CLI Agent + MCP)
     │                             │                     │                          │
     │─── POST /api/chat ─────────▶│                     │                          │
     │                             │── streamText() ─────┼─────────────────────────▶│
     │◀── AI SDK stream ───────────│                     │                          │
     │                             │                     │                          │
     │                             │                     │   MCP: getFormSnapshot   │
     │◀── tool-call ───────────────│◀─── NDJSON ─────────┼──────────────────────────│
     │    (getFormSnapshot)        │                     │                          │
     │                             │                     │                          │
     │  onToolCall → snapshot()    │                     │                          │
     │                             │                     │                          │
     │─── POST /api/chat ─────────▶│── relay.respond ───▶│                          │
     │    (tool results)           │                     │── publish response ─────▶│
     │                             │                     │                          │
     │                             │                     │   MCP: executeFormActions│
     │◀── tool-call ───────────────│◀─── NDJSON ─────────┼──────────────────────────│
     │    (executeFormActions)     │                     │                          │
     │                             │                     │                          │
     │  onToolCall → execute()     │                     │                          │
     │                             │                     │                          │
     │─── POST /api/chat ─────────▶│── relay.respond ───▶│                          │
     │    (tool results)           │                     │── publish response ─────▶│
     │                             │                     │                          │
     │◀── AI SDK stream (done) ────│◀─────── NDJSON ─────┼──────────────────────────│
     ▼                             ▼                     ▼                          ▼
```

## Project Structure

```
agent-container/
├── packages/
│   ├── agent-builder/            # @giselles-ai/agent-builder — build-time integration
│   ├── agent-runtime/            # @giselles-ai/agent-runtime — sandbox runtime primitives
│   ├── agent-snapshot-kit/       # @giselles-ai/agent-snapshot-kit — snapshot build CLI/library
│   ├── browser-tool/             # @giselles-ai/browser-tool — browser automation domain package
│   └── giselle-provider/         # @giselles-ai/giselle-provider — AI SDK provider
└── scripts/
```

`agent-runtime` and `agent-snapshot-kit` are the canonical target names for this package realignment. The current directories and package manifests still use `packages/sandbox-agent` and `packages/sandbox-agent-kit` until the later rename phases land.

`apps/demo` is a consumer app and is not part of the package taxonomy. `root/sandbox-agent/` is deprecated legacy workspace material and is not part of the active package taxonomy.

## Packages

### `@giselles-ai/agent-builder`

Build-time integration package for defining agents and wiring framework-specific build hooks.

| Export Path | Description |
|---|---|
| `@giselles-ai/agent-builder` | `defineAgent()`, config hashing, and shared agent definition types |
| `@giselles-ai/agent-builder/next` | Next.js plugin entry point (`withGiselleAgent`) |
| `@giselles-ai/agent-builder/next-server` | Server-side build handler APIs (`createBuildHandler`) |

### `@giselles-ai/agent-runtime`

Sandbox runtime primitives for running CLI agents in Vercel Sandbox containers. This is the canonical target package name; the current directory and package manifest still use `sandbox-agent` until the rename phase lands.

| Export | Description |
|---|---|
| `ChatAgent` | Interface for pluggable CLI agent implementations |
| `createGeminiAgent()` | Gemini CLI agent (runs `gemini --output-format stream-json`) |
| `AGENT_METADATA_PATH` | Path to agent metadata file inside snapshots (`/.agent-metadata.json`) |
| `readAgentMetadata()` | Read agent metadata from a sandbox snapshot |
| `runChat()` | Sandbox orchestrator that creates/resumes a sandbox and streams NDJSON |

### `@giselles-ai/agent-snapshot-kit`

Snapshot build CLI/library for preparing sandboxes with agent CLIs and browser-tool assets. This is the canonical target package name; the current package name, directory, and CLI still use `sandbox-agent-kit` until the rename phase lands.

| Export / Command | Description |
|---|---|
| `buildSnapshot()` | Build or extend a sandbox snapshot with agent CLIs and browser-tool artifacts |
| `BuildSnapshotOptions` | Options for local or npm-based snapshot assembly |
| `agent-snapshot-kit build-snapshot` | Canonical target CLI command name for the later rename phase |

### `@giselles-ai/browser-tool`

Browser automation toolkit covering DOM snapshot/execute operations, the MCP server, and the relay infrastructure. `@giselles-ai/browser-tool` stays a single domain package; subpath exports separate runtimes without splitting the package again.

| Export Path | Runtime | Description |
|---|---|---|
| `@giselles-ai/browser-tool` | env-agnostic | Shared types and Zod schemas |
| `@giselles-ai/browser-tool/dom` | browser | Client-side `snapshot()` and `execute()` functions |
| `@giselles-ai/browser-tool/react` | React client | React integration components |
| `@giselles-ai/browser-tool/relay` | Node / server | Server-side relay handlers and sessions |
| `@giselles-ai/browser-tool/mcp-server` | sandbox / Node process | MCP server entry point |

### `@giselles-ai/giselle-provider`

Custom AI SDK `LanguageModelV3` provider — the bridge between CLI agents running in sandboxes and the AI SDK ecosystem. Translates the agent's NDJSON output into AI SDK stream parts, maps relay-based browser tool requests into `tool-call` parts, and manages two-layer sessions (Redis metadata + process-local live connections) for hot/cold stream resumption.

| Export | Description |
|---|---|
| `giselle()` | Factory function returning a `GiselleAgentModel` instance |
| `GiselleAgentModel` | `LanguageModelV3` implementation (`doStream`) |
| `GiselleAgentConfig` | Agent selection config passed to the provider (`type`, `snapshotId`) |
| `extractJsonObjects()` | NDJSON parser |
| `mapNdjsonEvent()` | NDJSON event → `LanguageModelV3StreamPart` mapper |
| `createSession()` / `loadSession()` | Redis session management |

## Usage

### Route Handler

```ts
// app/api/chat/route.ts
import { giselle } from "@giselles-ai/giselle-provider";
import { streamText, tool, convertToModelMessages, validateUIMessages } from "ai";
import { snapshotFieldSchema, browserToolActionSchema, executionReportSchema } from "@giselles-ai/browser-tool";
import { z } from "zod";

const tools = {
  getFormSnapshot: tool({
    description: "Capture the current state of form fields on the page.",
    inputSchema: z.object({ instruction: z.string() }),
    outputSchema: z.object({ fields: z.array(snapshotFieldSchema) }),
  }),
  executeFormActions: tool({
    description: "Execute fill, click, and select actions on form fields.",
    inputSchema: z.object({
      actions: z.array(browserToolActionSchema),
      fields: z.array(snapshotFieldSchema),
    }),
    outputSchema: z.object({ report: executionReportSchema }),
  }),
};

export async function POST(request: Request) {
  const body = await request.json();
  const messages = await validateUIMessages({ messages: body.messages, tools });

  const result = streamText({
    model: giselle({
      cloudApiUrl: "https://studio.giselles.ai",
      headers: { authorization: "Bearer ..." },
    }),
    messages: await convertToModelMessages(messages),
    tools,
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse();
}
```

### Agent Selection

`giselle()` can accept an optional `agent` object to select the backend on a per-request basis:

```ts
const result = streamText({
  model: giselle({
    cloudApiUrl: "https://studio.giselles.ai",
    headers: { authorization: "Bearer ..." },
    agent: { type: "codex" },
  }),
  messages: await convertToModelMessages(messages),
  tools,
  abortSignal: request.signal,
});

const metadataDrivenResult = streamText({
  model: giselle({
    cloudApiUrl: "https://studio.giselles.ai",
    headers: { authorization: "Bearer ..." },
    agent: { snapshotId: "snap_custom_research_agent" },
  }),
  messages: await convertToModelMessages(messages),
  tools,
  abortSignal: request.signal,
});
```

Resolution order:
1. `agent.type` in `providerOptions.giselle.agent` (request-scoped, highest priority)
2. `AGENT_TYPE` environment variable
3. Cloud API may still finalize selection from snapshot metadata (`/.agent-metadata.json`), which can override request/env values

### React (useChat + onToolCall)

```tsx
import { useChat } from "@ai-sdk/react";
import { snapshot, execute } from "@giselles-ai/browser-tool/dom";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";

function Chat() {
  const { status, messages, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === "getFormSnapshot") {
        addToolOutput({
          tool: "getFormSnapshot",
          toolCallId: toolCall.toolCallId,
          output: { fields: snapshot() },
        });
      }
      if (toolCall.toolName === "executeFormActions") {
        const report = execute(toolCall.input.actions, toolCall.input.fields);
        addToolOutput({
          tool: "executeFormActions",
          toolCallId: toolCall.toolCallId,
          output: { report },
        });
      }
    },
  });

  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>{m.role}: {m.parts.map(p => p.type === "text" ? p.text : "").join("")}</p>
      ))}
      <button onClick={() => sendMessage({ text: "Fill out the form" })}>Send</button>
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
cp apps/demo/.env.example apps/demo/.env.development.local
# Fill in the required environment variables (see below)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

#### Required (cloud API)

| Variable | Description |
|---|---|
| `EXTERNAL_AGENT_API_BEARER_TOKEN` | Bearer token for the Giselle cloud API |

#### Required (self-hosted)

| Variable | Description |
|---|---|
| `AGENT_TYPE` | Deployment fallback agent selection (`gemini` default, `codex` for OpenAI Codex) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `OPENAI_API_KEY` | OpenAI API key for Codex mode |
| `CODEX_API_KEY` | Optional alias for `OPENAI_API_KEY` in Codex mode |
| `SANDBOX_SNAPSHOT_ID` | Optional fallback snapshot ID for env-based agent selection (overridden by request config when provided) |
| `REDIS_URL` | Redis connection URL for relay sessions |

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

For a Codex-enabled snapshot:

```bash
SNAPSHOT_AGENT=codex pnpm snapshot:browser-tool
```

or

```bash
pnpm snapshot:browser-tool:codex
```

Codex snapshots include:

- `codex` installed globally in the snapshot image
- Built browser-tool MCP artifacts (so current repo upload/build flow remains unchanged)
- No Gemini settings file is written

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start the demo app |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm format` | Format with Biome |
| `pnpm snapshot:browser-tool` | Create a sandbox snapshot |
| `pnpm snapshot:browser-tool:codex` | Create a Codex-enabled sandbox snapshot |
| `pnpm sandbox:local:browser-tool` | Prepare local sandbox environment |
| `pnpm mcp:check` | Run MCP smoke tests |
| `pnpm knip` | Check for unused exports/dependencies |
| `pnpm cli:release` | Release the CLI package |

## Publishing

Packages are published via the **Publish** workflow (`publish.yml`), triggered manually with a version bump choice (`patch`, `minor`, or `major`).

You can trigger it from the command line with the GitHub CLI:

```bash
gh workflow run publish.yml -f bump=patch
```

To target a specific branch:

```bash
gh workflow run publish.yml --ref main -f bump=minor
```

## License

[Apache-2.0](LICENSE)
