# Giselles Agent Container (Monorepo)

Next.js 上で Gemini CLI + MCP + Browser Bridge を使ったフォーム自動入力を行うための実験環境です。

## Packages

- `packages/agent` — `@giselles-ai/agent`
  - サーバー: `handleAgentRunner()`
  - クライアント: `useAgent()`
- `packages/browser-tool` — `@giselles-ai/browser-tool`
  - 型 + Zod スキーマ
  - DOM 操作 (`snapshot` / `execute`)
  - planner (`planActions`)
- `packages/mcp-server` — `@giselles/mcp-server`
  - Gemini CLI から呼ばれる MCP server
- `packages/web` — Next.js デモアプリ

## Prerequisites

- Node.js 20+
- pnpm 10+
- OpenAI API key
- Gemini API key
- Redis URL
- `RPA_SANDBOX_SNAPSHOT_ID`

## Setup

```bash
pnpm install
cp packages/web/.env.example packages/web/.env.local
# edit packages/web/.env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required env vars (Gemini + MCP + Bridge)

```bash
OPENAI_API_KEY=...
GEMINI_API_KEY=...
RPA_SANDBOX_SNAPSHOT_ID=...
REDIS_URL=...
```

Redis fallback env names:

- `REDIS_TLS_URL`
- `KV_URL`
- `UPSTASH_REDIS_TLS_URL`
- `UPSTASH_REDIS_URL`

Optional:

```bash
RPA_SANDBOX_REPO_ROOT=/vercel/sandbox
RPA_MCP_SERVER_DIST_PATH=/vercel/sandbox/packages/mcp-server/dist/index.js
RPA_MCP_SERVER_CWD=/vercel/sandbox
RPA_SKIP_SANDBOX_BUILD=1
GISELLE_PROTECTION_PASSWORD=...
VERCEL_PROTECTION_BYPASS=...
```

## API Contract (`/api/agent`)

### POST `/api/agent`

- `type: "agent.run"`
  - input: `{ message, document?, session_id?, sandbox_id? }`
  - response: NDJSON stream (first event is `bridge.session`)
- `type: "bridge.dispatch"`
  - input: `{ sessionId, token, request, timeoutMs? }`
  - response: `{ ok: true, response }` or error payload
- `type: "bridge.respond"`
  - input: `{ sessionId, token, response }`
  - response: `{ ok: true }` or error payload

### GET `/api/agent?type=bridge.events&sessionId=...&token=...`

- SSE stream for browser bridge requests

## Minimal integration

### Route handler

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({ tools: { browser: true } });

export const GET = handler.GET;
export const POST = handler.POST;
```

### Client hook

```ts
import { useAgent } from "@giselles-ai/agent/react";

const { status, messages, tools, error, sendMessage } = useAgent({
  endpoint: "/api/agent",
});
```

## Create Sandbox Snapshot

`pnpm snapshot:rpa` で以下を含む snapshot を作成します。

- `gemini` CLI
- built `packages/browser-tool/dist/planner/index.js`
- built `packages/mcp-server/dist/index.js`

Script output で以下の推奨値が表示されます。

- `RPA_SANDBOX_SNAPSHOT_ID`
- `RPA_SANDBOX_REPO_ROOT`
- `RPA_MCP_SERVER_DIST_PATH`
- `RPA_MCP_SERVER_CWD`
- `RPA_SKIP_SANDBOX_BUILD=1`

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm format
pnpm snapshot:rpa
pnpm sandbox:local:rpa
```

## Local sandbox reproduction

`pnpm sandbox:local:rpa` でローカルに `/vercel/sandbox` 相当の構成を `.sandbox-local/vercel/sandbox` として作成し、以下を実施します。

- `@giselles-ai/browser-tool` build
- `@giselles/mcp-server` build
- `packages/browser-tool/dist/planner/index.js` の import 検証

これはローカル事前検証用です。実行環境の Sandbox では `snapshot:rpa` で生成した snapshot を使って `/vercel/sandbox` 配下に同じ成果物を配置してください。
