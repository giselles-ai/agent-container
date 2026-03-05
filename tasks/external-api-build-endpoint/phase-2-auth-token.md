# Phase 2: 認証トークンの環境変数設定

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 0 (依存追加済み)
> **Parallel with:** Phase 1
> **Blocks:** なし

## Objective

`createBuildHandler` の `verifyToken` コールバックで使用する環境変数を決定し、Vercel（または使用中のホスティング）に設定する。agent-container 側と同じトークン値を共有する。

## Deliverables

### 1. 環境変数の決定

agent-container 側は `EXTERNAL_AGENT_API_BEARER_TOKEN` という環境変数からトークンを取得して `Authorization: Bearer <token>` ヘッダーで送信する。

External API 側では、このトークンを検証するための環境変数を設定する。変数名はプロジェクトの既存の命名規約に合わせる。

```ts
// 例: verifyToken の実装
verifyToken: (token) => token === process.env.AGENT_BUILD_API_TOKEN,
```

### 2. Vercel 環境変数の設定

Vercel Dashboard または CLI で環境変数を設定：

```bash
vercel env add AGENT_BUILD_API_TOKEN
```

- **Production / Preview / Development** すべてに設定
- 値は agent-container 側の `EXTERNAL_AGENT_API_BEARER_TOKEN` と同じ文字列

### 3. ローカル開発用

`.env.local` に追加（`.gitignore` に含まれていること）：

```
AGENT_BUILD_API_TOKEN=<same-token-value>
```

## Verification

1. **認証なしリクエスト → 401:**
   ```bash
   curl -X POST http://localhost:3000/agent-api/build \
     -H "Content-Type: application/json" \
     -d '{"base_snapshot_id":"snap_test","config_hash":"abcdef1234567890","agent_type":"gemini","files":[]}'
   ```
   Expected: `{"ok":false,"message":"Missing authorization token."}`

2. **不正トークン → 401:**
   ```bash
   curl -X POST http://localhost:3000/agent-api/build \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer wrong-token" \
     -d '{"base_snapshot_id":"snap_test","config_hash":"abcdef1234567890","agent_type":"gemini","files":[]}'
   ```
   Expected: `{"ok":false,"message":"Invalid authorization token."}`

3. **正しいトークン → 400 or 200:**
   ```bash
   curl -X POST http://localhost:3000/agent-api/build \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <correct-token>" \
     -d '{"base_snapshot_id":"snap_test","config_hash":"abcdef1234567890","agent_type":"gemini","files":[]}'
   ```
   Expected: 200 (or 500 if Sandbox 接続不可 — それは OK)

## Files to Create/Modify

| File | Action |
|---|---|
| `.env.local` | **Modify** — `AGENT_BUILD_API_TOKEN` 追加 |
| ルートハンドラ (Phase 1 で作成) | **Modify** — `verifyToken` に環境変数を使用 |

## Done Criteria

- [ ] `verifyToken` が環境変数からトークンを検証している
- [ ] Vercel Dashboard に環境変数が設定されている
- [ ] 認証なし / 不正トークンで 401 が返る
- [ ] 正しいトークンでリクエストが通る
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
