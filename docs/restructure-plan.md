# browser-tool 再構成 実装確定版

## 決定事項

1. 互換レイヤーは作らない（破壊的移行）。
2. API は単一路線に統一する。
   - `POST /api/agent` (`agent.run` / `bridge.dispatch` / `bridge.respond`)
   - `GET /api/agent?type=bridge.events&sessionId&token`
3. planner は `@giselles-ai/browser-tool` に同梱する。
4. `packages/web` は `/gemini-browser-tool` を `useAgent` 化し、`/` は簡易ランディングにする。

## 最終パッケージ構成

```text
packages/
├── agent/         @giselles-ai/agent
├── browser-tool/  @giselles-ai/browser-tool
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
- `./mcp-server`: sandbox 内 MCP server エントリポイント

### `@giselles-ai/agent`

- `.`: `handleAgentRunner`
- `./react`: `useAgent`, `BrowserToolProvider`, `PromptPanel`, `useBrowserTool`

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
5. sandbox 内 MCP (`@giselles-ai/browser-tool/mcp-server`) は `bridge.dispatch` を呼び、planner は `@giselles-ai/browser-tool/planner/runtime` を dynamic import する。

## mcp-server 統合変更点

- 旧 mcp-server パッケージを廃止し、`@giselles-ai/browser-tool/mcp-server` に統合
- browser-tool の subpath export に `./mcp-server` を追加
- sandbox 側の dist 参照を `packages/browser-tool/dist/mcp-server/index.js` に統一

## web 変更点

- 追加: `app/api/agent/route.ts`
- 削除: `app/api/gemini-browser-tool/[...slug]/route.ts`, `app/api/browser-tool/route.ts`, `app/api/chat/route.ts`
- `app/gemini-browser-tool/page.tsx` を `useBridge` -> `useAgent` へ移行
- `app/page.tsx` を簡易ランディング化
- snapshot 作成スクリプトを `browser-tool` ベースへ更新

## 受け入れ基準

- `pnpm --filter @giselles-ai/browser-tool build`
- `pnpm --filter @giselles-ai/agent build`
- `pnpm --filter demo build`
- `pnpm typecheck`

上記が通り、`/gemini-browser-tool` で snapshot -> plan -> execute の往復が動作すること。
