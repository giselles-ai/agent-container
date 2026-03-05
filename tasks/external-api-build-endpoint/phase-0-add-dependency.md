# Phase 0: `@giselles-ai/agent-builder` 依存追加

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** なし
> **Blocks:** Phase 1, Phase 2

## Objective

External API プロジェクトに `@giselles-ai/agent-builder` パッケージを依存として追加する。

## Deliverables

### 1. パッケージの依存追加

`@giselles-ai/agent-builder` を `dependencies` に追加する。

パッケージの公開方法に応じて以下のいずれか：

**npm に publish 済みの場合:**
```bash
pnpm add @giselles-ai/agent-builder@0.1.0
```

**Git 依存（monorepo 内 or GitHub 参照）の場合:**
```json
{
  "dependencies": {
    "@giselles-ai/agent-builder": "github:giselles-ai/agent-container#main"
  }
}
```

**ローカル開発の場合（workspace 参照）:**
```json
{
  "dependencies": {
    "@giselles-ai/agent-builder": "workspace:*"
  }
}
```

> **Note:** `@vercel/sandbox` は `createBuildHandler` 内部で使用される。External API に既に入っているはず（`/agent-api/run` で使用中）。入っていなければ `@vercel/sandbox@1.6.0` も追加する。

### 2. インストール確認

```bash
pnpm install
```

### 3. import 解決の確認

以下がエラーなく解決されることを確認：

```ts
import { createBuildHandler } from "@giselles-ai/agent-builder/next-server";
```

`@giselles-ai/agent-builder` は 3 つのエントリポイントを持つ：
- `@giselles-ai/agent-builder` — `defineAgent`, `AgentConfig` 型
- `@giselles-ai/agent-builder/next` — `withGiselleAgent` (agent-container 側で使用)
- `@giselles-ai/agent-builder/next-server` — `createBuildHandler` (**External API 側で使用**)

## Verification

1. `pnpm install` が成功する
2. TypeScript で `import { createBuildHandler } from "@giselles-ai/agent-builder/next-server"` が解決できる（typecheck で確認）

## Files to Create/Modify

| File | Action |
|---|---|
| `package.json` | **Modify** — `@giselles-ai/agent-builder` を dependencies に追加 |

## Done Criteria

- [ ] `@giselles-ai/agent-builder` が dependencies に追加されている
- [ ] `pnpm install` が成功する
- [ ] `@giselles-ai/agent-builder/next-server` からの import が解決できる
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
