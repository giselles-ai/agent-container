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
# GISELLE_SANDBOX_AGENT_CLOUD_API_URL=https://cloud.giselles.ai
```

### 3. Route

`app/api/agent/route.ts`:

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
  apiKey: process.env.GISELLE_SANDBOX_AGENT_API_KEY!,
});

export const POST = handler.POST;
```

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
BROWSER_TOOL_SANDBOX_SNAPSHOT_ID=...
REDIS_URL=redis://...
```

### Route

```ts
import { handleAgentRunner } from "@giselles-ai/agent-self";

export const runtime = "nodejs";

const handler = handleAgentRunner({ tools: { browser: true } });

export const GET = handler.GET;
export const POST = handler.POST;
```

## Migration note

- 旧 `@giselles-ai/agent` の self-hosted サーバー実装は `@giselles-ai/agent-self` に移動しました。
- Cloud 利用時は `@giselles-ai/agent` を使い、route は `POST` のみ export してください。
