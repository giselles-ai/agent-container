# browser-tool 再構成 実装確定版

## 決定事項

1. 互換レイヤーは作らない（破壊的移行）。
2. API は単一路線に統一する。
   - `POST /api/agent` (`agent.run` / `bridge.dispatch` / `bridge.respond`)
   - `GET /api/agent?type=bridge.events&sessionId&token`
3. planner は `@giselles-ai/browser-tool` に同梱する。
4. `packages/web` は `/gemini-rpa` を `useAgent` 化し、`/` は簡易ランディングにする。

## 最終パッケージ構成

```text
packages/
├── agent/         @giselles-ai/agent
├── browser-tool/  @giselles-ai/browser-tool
├── mcp-server/    @giselles/mcp-server
└── web/           demo app
```

削除済み:

- `packages/browser-tool-sdk`
- `packages/browser-tool-bridge`
- `packages/browser-tool-planner`

## Public API

### `@giselles-ai/browser-tool`

- `.`: 型 + Zod スキーマ
- `./dom`: `snapshot`, `execute`
- `./planner`: `planActions`
- `./planner/runtime`: runtime import 用 alias

### `@giselles-ai/agent`

- `.`: `handleAgentRunner`
- `./react`: `useAgent`, `RpaProvider`, `PromptPanel`, `useRpa`

## Route Handler

```ts
import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({ tools: { browser: true } });
export const GET = handler.GET;
export const POST = handler.POST;
```

## データフロー

1. `useAgent().sendMessage()` が `POST /api/agent` (`type: "agent.run"`) を呼ぶ。
2. サーバーが bridge session を作成し、NDJSON 先頭で `bridge.session` を返す。
3. クライアントが自動で `GET /api/agent?type=bridge.events...` に接続する。
4. SSE の `snapshot_request` / `execute_request` を DOM で実行し、`bridge.respond` で返す。
5. sandbox 内 MCP (`@giselles/mcp-server`) は `bridge.dispatch` を呼び、planner は `@giselles-ai/browser-tool/planner/runtime` を dynamic import する。

## mcp-server 変更点

- `@giselles/browser-tool-sdk` / `@giselles/browser-tool-planner` 依存を削除
- `@giselles-ai/browser-tool` へ置換
- dispatch URL を `/api/agent` + `type: "bridge.dispatch"` へ変更
- planner import を `@giselles-ai/browser-tool/planner/runtime` へ変更

## web 変更点

- 追加: `app/api/agent/route.ts`
- 削除: `app/api/gemini-rpa/[...slug]/route.ts`, `app/api/rpa/route.ts`, `app/api/chat/route.ts`
- `app/gemini-rpa/page.tsx` を `useBridge` -> `useAgent` へ移行
- `app/page.tsx` を簡易ランディング化
- snapshot 作成スクリプトを `browser-tool` ベースへ更新

## 受け入れ基準

- `pnpm --filter @giselles-ai/browser-tool build`
- `pnpm --filter @giselles-ai/agent build`
- `pnpm --filter @giselles/mcp-server build`
- `pnpm --filter demo build`
- `pnpm typecheck`

上記が通り、`/gemini-rpa` で snapshot -> plan -> execute の往復が動作すること。
