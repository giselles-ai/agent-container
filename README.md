# Giselle Sandbox Agent

An OpenClaw-like agent experience on Vercel with explicit workspace, files, and snapshots.

The most reliable onboarding is:
1. install this repository as a skill
2. set one API key
3. let your coding agent scaffold the first app with `build-giselle-agent`

### Recommended onboarding (skill-first)

#### 1. Add skill
```bash
npx skills add giselles-ai/agent-container
```

#### 2. Create your Studio account and API key

1. Open [studio.giselles.ai](https://studio.giselles.ai)
2. Generate an API key
3. Add it to `.env.local`:
```env
GISELLE_AGENT_API_KEY=<your-api-key>
```

#### 3. Ask your coding agent to generate the starter app

```text
Use the build-giselle-agent skill to build a Vercel-hosted OpenClaw-like sandbox agent app.
Keep it minimal and inspectable: chat flow, files in ./workspace, and artifact outputs under ./artifacts.
```

### Manual SDK setup (advanced)

### Usage

See [Getting Started](./docs/01-getting-started/01-01-getting-started.md) for manual SDK wiring.

#### Define Agent

```ts
import { defineAgent } from "@giselles-ai/agent";

const agentMd = "You are a helpful assistant";

export const agent = defineAgent({
  agentType: "gemini",
  agentMd,
});
```

#### Server API

```ts
import { type BrowserTools, browserTools } from "@giselles-ai/browser-tool";
import { giselle } from "@giselles-ai/giselle-provider";
import {
  consumeStream,
  convertToModelMessages,
  type InferUITools,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { agent } from "../../lib/agent";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const sessionId = body.id ?? crypto.randomUUID();

  const messages = await validateUIMessages<
    UIMessage<never, never, InferUITools<BrowserTools>>
  >({
    messages: body.messages,
    tools: browserTools,
  });

  const result = streamText({
    model: giselle({
      agent,
    }),
    messages: await convertToModelMessages(messages),
    tools: browserTools,
    providerOptions: {
      giselle: {
        sessionId,
      },
    },
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "x-giselle-session-id": sessionId,
    },
    consumeSseStream: consumeStream,
  });
}
```

#### UI

```tsx
import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";

const browserTool = useBrowserToolHandler();

const { status, messages, error, sendMessage, addToolOutput } = useChat({
  transport: new DefaultChatTransport({
    api: "/chat",
  }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  ...browserTool,
});

browserTool.connect(addToolOutput);
```

### Features

- **Vercel AI SDK compatible** — Works as a drop-in model provider for `streamText` and `useChat`, implementing the `LanguageModelV3` interface
- **Multiple CLI agents** — Supports Gemini CLI and Codex CLI as execution runtimes inside Vercel Sandbox
- **Browser tools** — Agents can interact with the user's browser (snapshot DOM, click, fill, select) via an MCP server relay between the sandbox and the client
- **Cloud API & self-host** — Get started instantly with the hosted Cloud API, or self-host with your own Vercel Sandbox and Redis
- **Next.js integration** — `withGiselleAgent` plugin for `next.config.ts` that automatically builds sandbox snapshots and injects configuration

To understand how these pieces fit together — sandbox orchestration, the relay bridge, NDJSON stream mapping — see the [Architecture](./docs/03-architecture/03-01-architecture.md) guide.

### Packages

Package|Description
-------|-----------
`@giselles-ai/agent`|Define and configure CLI agents (Gemini CLI, Codex CLI) for use with the SDK
`@giselles-ai/agent-kit`|CLI & library for building Vercel Sandbox snapshots with pre-installed agent tooling
`@giselles-ai/browser-tool`|Browser interaction tools (click, fill, select, snapshot) bridged between CLI agents and the client via MCP
`@giselles-ai/giselle-provider`|Vercel AI SDK-compatible model provider that routes `streamText` calls to a Giselle-hosted CLI agent
