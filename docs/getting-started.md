# Getting Started — Agent Packages

このリポジトリでは、以下 2 つの導入モードを提供します。

- Cloud mode: `@giselles-ai/agent` (推奨)
- Self-hosted mode: `@giselles-ai/agent-self`

## Cloud mode (`@giselles-ai/agent`)

Cloud mode では、ユーザー側で必要なのは API key のみです。

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

`baseUrl` は最終 endpoint URL として扱われます（`/api/agent` などの suffix は自動付与されません）。
`baseUrl` 未指定の場合は `https://studio.giselles.ai/agent-api` が既定値として使われます。

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

`bridge.session` に `bridgeUrl` が含まれる場合、`useAgent()` は SSE と `bridge.respond` をその URL に直接送信します。
`bridgeUrl` がない場合は従来どおり `endpoint` にフォールバックします。

## Self-hosted mode (`@giselles-ai/agent-self`)

既存の self-hosted 構成を維持したい場合はこちらを使います。

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

`baseUrl` は任意で、指定しない場合は `self-hosted` route の
`request.url.origin + request.url.pathname`（例: `https://localhost:3000/agent-api`）を既定で使います。

`/api/agent` を self-hosted route へ proxy する場合:

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
  baseUrl: process.env.GISELLE_SANDBOX_AGENT_BASE_URL!,
});

export const POST = handler.POST;
```

## Migration note

- 旧 `@giselles-ai/agent` の self-hosted サーバー実装は `@giselles-ai/agent-self` に移動しました。
- Cloud 利用時は `@giselles-ai/agent` を使い、route は `POST` のみ export してください。
- `@giselles-ai/agent-self` では `createAgentApiHandler` が推奨です（`handleAgentRunner` も互換 alias として利用可能）。
