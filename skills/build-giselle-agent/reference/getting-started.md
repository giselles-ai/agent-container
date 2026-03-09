# Getting Started

Turn any Next.js app into an **AI-agent-powered experience** in a few steps.
By the end of this guide your app will have a CLI agent (Gemini CLI or Codex CLI) running inside a cloud sandbox, streaming responses through Vercel AI SDK, and interacting with your UI through browser tools.

---

## Prerequisites

- Node.js 20+
- pnpm (recommended)
- A Next.js 15+ project (`create-next-app` is a perfect starting point)

---

## Step 1 — Install packages

Add the Giselle Agent SDK and Vercel AI SDK to your project:

```bash
pnpm add @giselles-ai/agent @giselles-ai/browser-tool @giselles-ai/giselle-provider ai @ai-sdk/react
```

| Package | What it does |
| --- | --- |
| `@giselles-ai/agent` | Define agents & Next.js build plugin |
| `@giselles-ai/browser-tool` | Browser interaction tools (click, fill, snapshot…) bridged between the sandbox and the client |
| `@giselles-ai/giselle-provider` | Vercel AI SDK–compatible model provider that routes `streamText` to a Giselle-hosted CLI agent |
| `ai` / `@ai-sdk/react` | Vercel AI SDK core (`streamText`, `useChat`, etc.) |

---

## Step 2 — Get your API key

1. Create an account at **[studio.giselles.ai](https://studio.giselles.ai)**
2. Generate an API key
3. Create a `.env.local` file in your project root:

```env
GISELLE_AGENT_API_KEY=<your-api-key>
```

That's it — the SDK connects to the Cloud API at `studio.giselles.ai` by default. Set `GISELLE_AGENT_BASE_URL` only if you're self-hosting.

---

## Step 3 — Define your agent

Create `lib/agent.ts`. This is where you describe *who* your agent is and *how* it should behave:

```ts
// lib/agent.ts
import { defineAgent } from "@giselles-ai/agent";

export const agent = defineAgent({
  agentType: "gemini", // or "codex"
  agentMd: `
You are a helpful assistant.
  `,
});
```

`agentMd` is the system prompt written in Markdown — it gets loaded as the agent's `AGENTS.md` inside the sandbox. Write it like you're briefing a teammate: what's the context, what tools are available, and how should the agent work.

---

## Step 4 — Wire up `next.config.ts`

Wrap your existing Next.js config with `withGiselleAgent`. This plugin builds a sandbox snapshot at dev/build time and injects it into your environment automatically.

```ts
// next.config.ts
import { withGiselleAgent } from "@giselles-ai/agent/next";
import type { NextConfig } from "next";
import { agent } from "./lib/agent";

const nextConfig: NextConfig = {
  /* your existing config */
};

export default withGiselleAgent(nextConfig, agent);
```

When you run `next dev`, you'll see the Giselle plugin authenticate and build:

```
✦ Giselle Agent
- Base URL: https://studio.giselles.ai/agent-api

✓ Authenticated
✓ Building...
✓ Ready in 1.2s
```

---

## Step 5 — Create the chat API route

Add a route handler that streams agent responses back to the client.

```ts
// app/chat/route.ts
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
    model: giselle({ agent }),
    messages: await convertToModelMessages(messages),
    tools: browserTools,
    providerOptions: {
      giselle: { sessionId },
    },
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
    headers: { "x-giselle-session-id": sessionId },
    consumeSseStream: consumeStream,
  });
}
```

The key pieces:

- **`giselle({ agent })`** — creates a Vercel AI SDK model backed by your CLI agent running in a cloud sandbox.
- **`browserTools`** — registers browser interaction tools so the agent can snapshot, click, and fill elements in the user's browser.
- **`sessionId`** — ties multiple turns of a conversation to the same sandbox session.

---

## Step 6 — Build the UI

Use `useChat` from `@ai-sdk/react` and connect the browser tool handler so the agent's tool calls get executed in the user's browser.

```tsx
// app/page.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";

export default function Home() {
  const browserTool = useBrowserToolHandler();

  const { status, messages, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({ api: "/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    ...browserTool,
  });

  browserTool.connect(addToolOutput);

  // Render your chat UI and interactive elements here.
  // Add `data-browser-tool-id` attributes to any elements
  // you want the agent to be able to see and interact with.
}
```

### Making elements visible to the agent

The agent can only interact with DOM elements that have a `data-browser-tool-id` attribute. Add it to inputs, buttons, or any element you want the agent to control:

```tsx
<input
  type="text"
  data-browser-tool-id="email-field"
  placeholder="Email"
/>
```

The agent will see these IDs when it snapshots the page and can target them with click/fill actions.

---

## You're done 🎉

Run `pnpm dev`, open your app, and start chatting. The agent will stream responses and can interact with any `data-browser-tool-id` element on the page.

### Recap — what changed from a fresh `create-next-app`

| | Before (bare Next.js) | After (with Giselle Agent) |
| --- | --- | --- |
| **Dependencies** | `next`, `react`, `react-dom` | + `@giselles-ai/agent`, `@giselles-ai/browser-tool`, `@giselles-ai/giselle-provider`, `ai`, `@ai-sdk/react` |
| **`next.config.ts`** | `export default nextConfig` | Wrapped with `withGiselleAgent(nextConfig, agent)` |
| **New files** | — | `lib/agent.ts`, `app/chat/route.ts`, `.env.local` |
| **UI** | Static page | `useChat` + `useBrowserToolHandler` + `data-browser-tool-id` on interactive elements |

---

## Next steps

- **Customize the agent prompt** — Edit `agentMd` in `lib/agent.ts` to shape the agent's personality and workflow.
- **Add files to the sandbox** — Pass a `files` array to `defineAgent()` to pre-load data or config into the agent's environment.
- **Try Codex CLI** — Switch `agentType` to `"codex"` for an OpenAI-powered agent.
