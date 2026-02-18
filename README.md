# Giselles Agent Container (Monorepo)

Next.js 上で Gemini CLI + MCP + Browser Bridge を使ったフォーム自動入力を検証するモノレポです。
Cloud モードと Self-hosted モードの両方を扱います。

## Packages / Apps

- `packages/agent` — `@giselles-ai/agent` (Cloud mode client/proxy package)
  - サーバー: `handleAgentRunner({ apiKey, cloudApiUrl? }) -> { POST }`
  - クライアント: `useAgent()` (`bridgeUrl` 対応)
- `packages/agent-self` — `@giselles-ai/agent-self` (Self-hosted package)
  - サーバー: `handleAgentRunner({ tools? }) -> { GET, POST }`
  - React: `@giselles-ai/agent/react` を再エクスポート
- `packages/agent-core` — 内部パッケージ (private)
  - Redis bridge broker + Gemini chat handler
- `packages/browser-tool` — `@giselles-ai/browser-tool`
  - 型 + Zod スキーマ
  - DOM 操作 (`snapshot` / `execute`)
  - MCP server (`./mcp-server` subpath export)
- `packages/web` — Cloud mode デモアプリ
- `apps/cloud-api` — Cloud API サービス本体

## Prerequisites

- Node.js 20+
- pnpm 10+

## Setup

```bash
pnpm install
cp packages/web/.env.example packages/web/.env.local
# edit packages/web/.env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Cloud Mode (推奨)

### Required env (demo app)

```bash
GISELLE_SANDBOX_AGENT_API_KEY=...
```

### Route handler (`@giselles-ai/agent`)

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
  apiKey: process.env.GISELLE_SANDBOX_AGENT_API_KEY!,
});

export const POST = handler.POST;
```

### Bridge behavior

- `POST /api/agent` (`agent.run`) はユーザーの Next.js を経由して Cloud API へ proxy
- `bridge.events` (SSE) と `bridge.respond` は `bridge.session.bridgeUrl` に直接接続

## Self-hosted Mode

### Required env

```bash
GEMINI_API_KEY=...
BROWSER_TOOL_SANDBOX_SNAPSHOT_ID=...
REDIS_URL=...
```

Redis fallback env names:

- `REDIS_TLS_URL`
- `KV_URL`
- `UPSTASH_REDIS_TLS_URL`
- `UPSTASH_REDIS_URL`

### Route handler (`@giselles-ai/agent-self`)

```ts
import { handleAgentRunner } from "@giselles-ai/agent-self";

export const runtime = "nodejs";

const handler = handleAgentRunner({ tools: { browser: true } });

export const GET = handler.GET;
export const POST = handler.POST;
```

## Client Hook

```ts
import { useAgent } from "@giselles-ai/agent/react";

const { status, messages, tools, error, sendMessage } = useAgent({
  endpoint: "/api/agent",
});
```

## Create Sandbox Snapshot

`pnpm snapshot:browser-tool` で以下を含む snapshot を作成します。

- `gemini` CLI
- built `packages/browser-tool/dist/mcp-server/index.js`

Script output で以下の推奨値が表示されます。

- `BROWSER_TOOL_SANDBOX_SNAPSHOT_ID`
- `BROWSER_TOOL_SANDBOX_REPO_ROOT`
- `BROWSER_TOOL_MCP_SERVER_DIST_PATH`
- `BROWSER_TOOL_MCP_SERVER_CWD`
- `BROWSER_TOOL_SKIP_SANDBOX_BUILD=1`

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm format
pnpm snapshot:browser-tool
pnpm sandbox:local:browser-tool
```
