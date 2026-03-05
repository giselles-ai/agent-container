# Phase 1: `POST /agent-api/build` ルートハンドラ作成

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 0 (依存追加済み)
> **Parallel with:** Phase 2
> **Blocks:** なし

## Objective

既存の `/agent-api/run` と同じルーティングパターンで `/agent-api/build` エンドポイントを追加する。`createBuildHandler` をインポートしてマウントするだけ。

## What You're Building

```mermaid
flowchart LR
    Client["agent-container<br/>next build"] -->|POST| Route["/agent-api/build<br/>route handler"]
    Route --> Handler["createBuildHandler()"]
    Handler --> Sandbox["Vercel Sandbox"]

    style Client fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Route fill:#1a1a2e,stroke:#e94560,color:#ffffff
    style Handler fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Sandbox fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Deliverables

### 1. ルートハンドラファイル

既存の `/agent-api/run` ルートハンドラを参考に、同じディレクトリパターンで作成する。

**Next.js App Router の場合** (`app/agent-api/build/route.ts`):

```ts
import { createBuildHandler } from "@giselles-ai/agent-builder/next-server";

const handler = createBuildHandler({
  verifyToken: (token) => token === process.env.AGENT_BUILD_API_TOKEN,
});

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
```

**Hono / Express 等の場合** は、既存の `/agent-api/run` のパターンに合わせて適宜調整する。

> **重要:** `verifyToken` の環境変数名は、プロジェクトで既に使われている認証パターンに合わせる。上記の `AGENT_BUILD_API_TOKEN` は仮の名前。Phase 2 で正式に決める。

### 2. 既存ルーティング設定の確認

- middleware やプロキシ設定で `/agent-api/build` がブロックされていないか確認
- `/agent-api/run` が通るなら `/agent-api/*` パターンで許可されているはず

## Verification

1. **Typecheck:**
   ```bash
   pnpm typecheck
   ```

2. **手動テスト（ローカル）:**
   ```bash
   # サーバー起動後
   curl -X POST http://localhost:3000/agent-api/build \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer test-token" \
     -d '{"base_snapshot_id":"snap_test","config_hash":"abcdef1234567890","agent_type":"gemini","files":[]}'
   ```
   - `verifyToken` 未設定 → 200 or 500 (Sandbox 接続エラーは OK)
   - `verifyToken` 設定済み + 無効トークン → 401

3. **Build:**
   ```bash
   pnpm build
   ```

## Files to Create/Modify

| File | Action |
|---|---|
| `app/agent-api/build/route.ts` (パスはプロジェクト構成に合わせる) | **Create** — ルートハンドラ |

## Done Criteria

- [ ] `/agent-api/build` に POST リクエストが到達する
- [ ] `createBuildHandler` が正しくインポート・呼び出しされている
- [ ] typecheck と build が通る
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
