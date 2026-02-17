# mcp-server を browser-tool に統合する

## 背景と経緯

### discussion #5310 での検討

[route06/giselle-division#5310](https://github.com/route06/giselle-division/discussions/5310) で browser-tool 系パッケージの再構成を検討した。旧 3 パッケージ（`browser-tool-sdk`, `browser-tool-bridge`, `browser-tool-planner`）を解体し、以下の構成に整理する方針が決まった。

| パッケージ | 役割 |
|---|---|
| `@giselles-ai/agent` | `handleAgentRunner()` + BridgeBroker + Sandbox 管理 (サーバー)、`useAgent()` hook (React) |
| `@giselles-ai/browser-tool` | 型定義・Zod スキーマ、`/dom` で snapshot/execute、`/planner` で planActions |
| `@giselles/mcp-server` (内部) | Sandbox 内で動く MCP プロセス |

この再構成は [PR #3](https://github.com/giselles-ai/agent-container/pull/3) で実装済み。

### 現在の mcp-server の位置づけ

discussion では `mcp-server` を「内部パッケージ」として独立させる結論になった。しかし実装してみると、このパッケージの独立性に違和感がある。

**現状の `packages/mcp-server` の中身:**

- `src/index.ts` — MCP サーバーの起動（`fillForm` ツール1つを登録するだけ）
- `src/bridge-client.ts` — Bridge への HTTP リクエストを送る BridgeClient クラス
- `src/tools/fill-form.ts` — snapshot → plan → execute のオーケストレーション

**依存関係:**

- `@giselles-ai/browser-tool` の型と Zod スキーマを import している
- `@giselles-ai/browser-tool/planner/runtime` を Sandbox 内で dynamic import している
- `@modelcontextprotocol/sdk` で MCP プロトコルを実装している

つまり mcp-server は browser-tool の「ブラウザ操作」機能を MCP プロトコルで公開するアダプタであり、browser-tool と密結合している。

## なぜ統合するか

1. **責務の一貫性** — mcp-server が提供する `fillForm` ツールは、browser-tool の snapshot/execute/planner をオーケストレーションするもの。ブラウザ操作の一部として browser-tool に含まれるのが自然。

2. **パッケージ数の削減** — private な内部パッケージが独立していると、ビルド順序の管理、snapshot スクリプトでのパス指定、chat-handler でのディレクトリ探索など、周辺コードの複雑さが増す。

3. **既存パターンとの整合** — browser-tool は既に `/dom` と `/planner` を subpath export で提供している。`/mcp-server` を追加するのは既存パターンの自然な拡張。

4. **planner との構造的類似性** — planner も Sandbox 内で dynamic import される server-side のみのコードだが、browser-tool の subpath として問題なく動いている。mcp-server も同様に扱える。

## 統合後の構成

```text
packages/
├── agent/         @giselles-ai/agent
├── browser-tool/  @giselles-ai/browser-tool   ← mcp-server を吸収
└── web/           demo app
```

### browser-tool の subpath exports

```text
@giselles-ai/browser-tool           → 型定義、Zod スキーマ（環境非依存）
@giselles-ai/browser-tool/dom       → snapshot(), execute()（ブラウザ内）
@giselles-ai/browser-tool/planner   → planActions()（サーバー / Sandbox）
@giselles-ai/browser-tool/mcp-server → MCP サーバーエントリポイント（Sandbox 内）
```

### ファイル配置

```text
packages/browser-tool/src/
├── index.ts              (型 + スキーマ)
├── types.ts
├── dom/
│   └── index.ts          (snapshot, execute)
├── planner/
│   └── index.ts          (planActions)
└── mcp-server/
    ├── index.ts           ← 旧 mcp-server/src/index.ts
    ├── bridge-client.ts   ← 旧 mcp-server/src/bridge-client.ts
    └── tools/
        └── fill-form.ts   ← 旧 mcp-server/src/tools/fill-form.ts
```

## 実装手順

### 1. ソースの移動

`packages/mcp-server/src/` 配下のファイルを `packages/browser-tool/src/mcp-server/` に移動する。

- `src/index.ts` → `src/mcp-server/index.ts`
- `src/bridge-client.ts` → `src/mcp-server/bridge-client.ts`
- `src/tools/fill-form.ts` → `src/mcp-server/tools/fill-form.ts`

import パスの `@giselles-ai/browser-tool` は相対パスに変更する（同一パッケージ内になるため）。

### 2. browser-tool の package.json 更新

`exports` に `./mcp-server` を追加し、`bin` と依存を追加する。

```jsonc
{
  "bin": {
    "giselles-mcp-server": "./dist/mcp-server/index.js"
  },
  "exports": {
    // 既存エントリは変更なし
    "./mcp-server": {
      "types": "./dist/mcp-server/index.d.ts",
      "import": "./dist/mcp-server/index.js",
      "default": "./dist/mcp-server/index.js"
    }
  },
  "dependencies": {
    // 既存に追加
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

### 3. tsup.ts にビルドエントリ追加

```ts
{
  entry: ["src/mcp-server/index.ts"],
  outDir: "dist/mcp-server",
  format: ["esm"],
  dts: true,
  clean: false,
},
```

### 4. パス参照の更新

以下のファイルで `packages/mcp-server` へのパス参照を `packages/browser-tool` ベースに変更する。

#### `packages/agent/src/internal/chat-handler.ts`

- `packages/mcp-server` ディレクトリの探索 → `packages/browser-tool` に変更
- `mcpServerDistPath` → `${repoRoot}/packages/browser-tool/dist/mcp-server/index.js`
- `@giselles/mcp-server` のビルドコマンド → 削除（browser-tool のビルドに含まれる）

#### `scripts/prepare-local-rpa-sandbox.mjs`

- `--filter @giselles/mcp-server` → 削除（browser-tool ビルドでカバー）
- `packages/mcp-server/dist/index.js` → `packages/browser-tool/dist/mcp-server/index.js`

#### `packages/web/scripts/create-rpa-snapshot.mjs`

- `INCLUDE_PATHS` から `"packages/mcp-server"` を削除
- `--filter @giselles/mcp-server` → 削除
- dist パスの参照を更新

### 5. fill-form.ts 内の planner import パス更新

現在の `fill-form.ts` は planner を絶対パスで dynamic import している：

```ts
const PLANNER_RUNTIME_DIST_PATH =
  "/vercel/sandbox/packages/browser-tool/dist/planner/index.js";
```

これは変更不要（planner の dist パスは変わらない）。

### 6. packages/mcp-server ディレクトリの削除

すべての参照を更新した後、`packages/mcp-server/` を削除する。

### 7. docs/restructure-plan.md の更新

パッケージ構成の記述から `mcp-server` 行を削除し、browser-tool の subpath 一覧に `./mcp-server` を追加する。

## 確認事項

以下がすべて通ること：

```bash
pnpm --filter @giselles-ai/browser-tool build
pnpm --filter @giselles-ai/agent build
pnpm typecheck
```

- `dist/mcp-server/index.js` が生成され、`node dist/mcp-server/index.js` で MCP サーバーが起動すること
- chat-handler から Sandbox 内の MCP サーバーが正しく参照されること
- snapshot → plan → execute の E2E フローが動作すること

## 影響範囲のまとめ

| 変更対象 | 変更内容 |
|---|---|
| `packages/browser-tool/src/mcp-server/` | 新規追加（mcp-server から移動） |
| `packages/browser-tool/package.json` | exports, bin, dependencies 追加 |
| `packages/browser-tool/tsup.ts` | ビルドエントリ追加 |
| `packages/agent/src/internal/chat-handler.ts` | パス参照更新、ビルドコマンド簡素化 |
| `scripts/prepare-local-rpa-sandbox.mjs` | パス参照更新、filter 簡素化 |
| `packages/web/scripts/create-rpa-snapshot.mjs` | パス参照更新、filter 簡素化 |
| `docs/restructure-plan.md` | パッケージ構成の記述更新 |
| `README.md` | パッケージ一覧の記述更新 |
| `packages/mcp-server/` | 削除 |
