# Getting Started — `@giselles-ai/agent`

`@giselles-ai/agent` を使うと、Next.js で Gemini CLI + MCP + SSE bridge を 1 つの API route (`/api/agent`) と 1 つの hook (`useAgent`) で扱えます。

## 前提条件

- Next.js (App Router)
- React 19+
- Node.js 20+
- Redis
- Vercel Sandbox が使える環境
- `GEMINI_API_KEY`
- `BROWSER_TOOL_SANDBOX_SNAPSHOT_ID`

## 1. パッケージインストール

```bash
pnpm add @giselles-ai/agent @giselles-ai/browser-tool
```

## 2. 環境変数設定

`.env.local`:

```env
GEMINI_API_KEY=...
BROWSER_TOOL_SANDBOX_SNAPSHOT_ID=...
REDIS_URL=redis://...

# optional
BROWSER_TOOL_BRIDGE_BASE_URL=https://your-app.vercel.app
BROWSER_TOOL_SKIP_SANDBOX_BUILD=false
VERCEL_PROTECTION_BYPASS=...
GISELLE_PROTECTION_PASSWORD=...
```

## 3. API route を作成

`app/api/agent/route.ts`:

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({ tools: { browser: true } });

export const GET = handler.GET;
export const POST = handler.POST;
```

## 4. フォームに `data-browser-tool-id` を付与

```tsx
<input data-browser-tool-id="title" />
<textarea data-browser-tool-id="body" />
<select data-browser-tool-id="category" />
<input type="checkbox" data-browser-tool-id="publish" />
```

## 5. `useAgent()` を使う

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

## `useAgent()` 返り値

- `status`: `"idle" | "connecting" | "connected" | "running" | "error"`
- `messages`: チャット履歴
- `tools`: tool use / result の履歴
- `warnings`: planner / executor の警告
- `stderrLogs`: sandbox stderr ログ
- `sandboxId`: sandbox id
- `geminiSessionId`: gemini session id
- `error`: 文字列エラー
- `sendMessage({ message, document? })`

## Bridge HTTP 契約

### POST `/api/agent`

- `{ type: "agent.run", message, document?, session_id?, sandbox_id? }`
- `{ type: "bridge.dispatch", sessionId, token, request, timeoutMs? }`
- `{ type: "bridge.respond", sessionId, token, response }`

### GET `/api/agent?type=bridge.events&sessionId=...&token=...`

- SSE 接続 (`ready`, keepalive, `snapshot_request`, `execute_request`)

## トラブルシューティング

- `UNAUTHORIZED`: `sessionId/token` 不一致
- `NO_BROWSER`: SSE 接続未確立
- `TIMEOUT`: bridge 応答タイムアウト
- `INVALID_RESPONSE`: request/response 型不整合

