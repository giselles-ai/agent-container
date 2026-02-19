# Getting Started — Agent Packages

This repository provides two deployment modes:

- Cloud mode: `@giselles-ai/agent` (recommended)
- Self-hosted mode: `@giselles-ai/agent-self`

## Cloud mode (`@giselles-ai/agent`)

In Cloud mode, users only need an API key.

### 1. Install

```bash
pnpm add @giselles-ai/agent @giselles-ai/browser-tool
```

### 2. Env

`.env.local`:

```env
GISELLE_SANDBOX_AGENT_API_KEY=...
# optional
# GISELLE_SANDBOX_AGENT_BASE_URL=https://studio.giselles.ai/agent-api
```

### 3. Route

`app/api/agent/route.ts`:

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
  apiKey: process.env.GISELLE_SANDBOX_AGENT_API_KEY!,
  baseUrl: "https://studio.giselles.ai/agent-api",
});

export const POST = handler.POST;
```

`baseUrl` is treated as the final endpoint URL (no suffix like `/api/agent` is appended automatically).
If `baseUrl` is not specified, `https://studio.giselles.ai/agent-api` is used as the default.

### 4. Hook

```tsx
"use client";

import { useAgent } from "@giselles-ai/agent/react";

export default function Page() {
  const { status, messages, tools, error, sendMessage } = useAgent({
    endpoint: "/api/agent",
  });

  async function handleSend(text: string) {
    await sendMessage({ message: text });
  }

  return (
    <main>
      <p>status: {status}</p>
      {error ? <p>{error}</p> : null}
      <button onClick={() => handleSend("Fill title and body")}>Send</button>
      <pre>{JSON.stringify({ messages, tools }, null, 2)}</pre>
    </main>
  );
}
```

When `bridge.session` contains a `bridgeUrl`, `useAgent()` sends SSE and `bridge.respond` directly to that URL.
If `bridgeUrl` is not present, it falls back to `endpoint` as before.

## Self-hosted mode (`@giselles-ai/agent-self`)

Use this if you want to maintain an existing self-hosted setup.

### Required env

```env
GEMINI_API_KEY=...
SANDBOX_SNAPSHOT_ID=...
REDIS_URL=redis://...
```

### Route

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

To proxy `/api/agent` to the self-hosted route:

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
  baseUrl: process.env.GISELLE_SANDBOX_AGENT_BASE_URL!,
});

export const POST = handler.POST;
```

## Migration note

- The former `@giselles-ai/agent` self-hosted server implementation has been moved to `@giselles-ai/agent-self`.
- For Cloud usage, use `@giselles-ai/agent` and export only `POST` from the route.
- For `@giselles-ai/agent-self`, `createAgentApiHandler` is recommended (`handleAgentRunner` is also available as a compatibility alias).
