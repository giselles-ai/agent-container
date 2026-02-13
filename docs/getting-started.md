# Getting Started — Giselles RPA SDK

Giselles RPA SDK を使うと、Next.js アプリのフォームを Gemini CLI から AI 駆動で自動入力できます。
開発者が書くコードは **API route 1 ファイル（8行）** と **ページコンポーネントへの hook 追加** だけです。

## 仕組み

```
ユーザーが Chat UI で指示
    ↓
useBridge() が Bridge Server 経由で Gemini CLI に送信
    ↓
Gemini CLI → MCP Server → Bridge → ブラウザに snapshot 要求
    ↓
ブラウザが DOM をスキャンして SnapshotField[] を返却
    ↓
Gemini CLI が LLM でアクション計画 → Bridge → ブラウザで DOM 操作
```

Gemini CLI は Vercel Sandbox 内で動作するためブラウザ DOM に直接アクセスできません。
SDK はこの制約を Redis Pub/Sub + SSE による Bridge アーキテクチャで透過的に解決します。
開発者は Bridge の内部プロトコルを意識する必要はありません。

## 前提条件

- Next.js 14+ (App Router)
- React 19+
- Node.js 20+
- Redis（[Vercel Marketplace の Redis](https://vercel.com/marketplace/redis)、Upstash、またはセルフホスト）
- [Vercel Sandbox](https://vercel.com/docs/sandbox) が利用可能な Vercel プロジェクト
- Gemini API キー
- AI planner 認証情報（任意）
  - OpenAI API キー（直接認証）
  - AI Gateway 認証情報（AI Gateway を利用）
    - `AI_GATEWAY_API_KEY`（固定キー）
    - `Vercel Functions` 実行時の OIDC (`x-vercel-oidc-token` ヘッダ)

## 1. パッケージのインストール

```bash
pnpm add @giselles/rpa-sdk @giselles/rpa-bridge
```

## 2. 環境変数の設定

`.env.local` に以下を設定します：

```env
# 必須
GEMINI_API_KEY=your-gemini-api-key
RPA_SANDBOX_SNAPSHOT_ID=your-sandbox-snapshot-id

# Redis（いずれか1つ）
REDIS_URL=redis://...
# または REDIS_TLS_URL, KV_URL, UPSTASH_REDIS_TLS_URL, UPSTASH_REDIS_URL

# オプション
RPA_BRIDGE_BASE_URL=https://your-app.vercel.app  # 未設定時はリクエスト元 origin を使用
VERCEL_PROTECTION_BYPASS=your-bypass-token        # Vercel Authentication 使用時
RPA_SKIP_SANDBOX_BUILD=false                      # true にすると Sandbox 内ビルドをスキップ
RPA_MCP_MOCK_PLAN=false                           # true にすると LLM を使わずモックで動作確認
```

## 3. API Route の作成

`app/api/gemini-rpa/[...slug]/route.ts` を作成します：

```ts
import { createBridgeRoutes } from "@giselles/rpa-bridge/next";

export const runtime = "nodejs";

const handler = createBridgeRoutes();

export const GET = handler.GET;
export const POST = handler.POST;
```

これだけで以下の5つのエンドポイントが自動的に提供されます：

| エンドポイント | 用途 |
|---|---|
| `POST .../session` | Bridge セッション作成 |
| `GET  .../events` | SSE 接続（ブラウザ ↔ Sandbox 間の通信） |
| `POST .../dispatch` | MCP Server → ブラウザへのリクエスト仲介 |
| `POST .../respond` | ブラウザ → MCP Server へのレスポンス返却 |
| `POST .../chat` | Gemini CLI の起動とストリーミング |

## 4. フォームに `data-rpa-id` を付与

SDK がフォームフィールドを識別するために、各入力要素に `data-rpa-id` 属性を追加します：

```tsx
<input
  id="title"
  name="title"
  data-rpa-id="title"    // ← これを追加
  type="text"
  value={title}
  onChange={(e) => setTitle(e.target.value)}
/>

<textarea
  id="body"
  name="body"
  data-rpa-id="body"     // ← これを追加
  value={body}
  onChange={(e) => setBody(e.target.value)}
/>

<select
  id="category"
  name="category"
  data-rpa-id="category" // ← これを追加
  value={category}
  onChange={(e) => setCategory(e.target.value)}
>
  <option value="memo">Memo</option>
  <option value="blog">Blog Post</option>
</select>

<input
  type="checkbox"
  name="publish"
  data-rpa-id="publish"  // ← これを追加
  checked={publish}
  onChange={(e) => setPublish(e.target.checked)}
/>
```

> **Note:** `data-rpa-id` がなくても SDK は `id`、`name`、CSS セレクタからフィールドを自動特定します。
> `data-rpa-id` を付けると一意性が保証され、DOM 構造が変わっても安定して動作します。

### SDK が認識するフォーム要素

| 要素 | サポートされる type |
|---|---|
| `<input>` | `text`, `email`, `password`, `number`, `tel`, `url`, `search`, `date`, `checkbox`, `radio` |
| `<textarea>` | — |
| `<select>` | — |

`hidden`, `submit`, `button`, `file`, `reset`, `image` は自動的に除外されます。

### ラベルの解決順序

SDK はフィールドのラベルを以下の優先順位で自動解決します：

1. `<label for="id">` による紐付け
2. `aria-label` 属性
3. `aria-labelledby` 属性
4. 祖先の `<label>` 要素のテキスト
5. `name` 属性
6. `id` 属性
7. `"unnamed-field"` (フォールバック)

## 5. `useBridge()` でチャット UI を実装

```tsx
"use client";

import { useState, useCallback } from "react";
import { useBridge } from "@giselles/rpa-bridge/react";

export default function MyPage() {
  const [input, setInput] = useState("");

  const {
    status,        // "connecting" | "connected" | "disconnected" | "error"
    chatStatus,    // "ready" | "streaming"
    messages,      // { id, role, content }[]
    warnings,      // string[]
    error,         // string | null
    sendMessage,   // ({ message, document? }) => Promise<void>
  } = useBridge({ endpoint: "/api/gemini-rpa" });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || chatStatus !== "ready") return;

      try {
        await sendMessage({ message: trimmed });
        setInput("");
      } catch {
        // エラーは error state で自動管理される
      }
    },
    [chatStatus, input, sendMessage]
  );

  return (
    <main>
      <MyForm />  {/* Step 4 で data-rpa-id を付けたフォーム */}

      <p>Bridge: {status}</p>

      <div>
        {messages.map((msg) => (
          <div key={msg.id}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Fill title and body with a concise summary"
        />
        <button type="submit" disabled={chatStatus !== "ready"}>
          Send
        </button>
      </form>
    </main>
  );
}
```

## `useBridge()` API リファレンス

### オプション

| プロパティ | 型 | 説明 |
|---|---|---|
| `endpoint` | `string` | API route のパス（例: `"/api/gemini-rpa"`） |

### 返り値

| プロパティ | 型 | 説明 |
|---|---|---|
| `status` | `BridgeStatus` | Bridge 接続状態: `"connecting"` / `"connected"` / `"disconnected"` / `"error"` |
| `chatStatus` | `ChatStatus` | チャット状態: `"ready"` / `"streaming"` |
| `messages` | `BridgeMessage[]` | チャット履歴 `{ id, role, content }` |
| `tools` | `ToolEvent[]` | Gemini CLI が実行したツール呼び出しの記録 |
| `warnings` | `string[]` | planner や executor からの警告メッセージ |
| `stderrLogs` | `string[]` | Sandbox の stderr 出力 |
| `sandboxId` | `string \| null` | 現在の Vercel Sandbox ID |
| `geminiSessionId` | `string \| null` | Gemini CLI のセッション ID |
| `session` | `BridgeSession \| null` | Bridge セッション情報 |
| `error` | `string \| null` | 直近のエラーメッセージ |
| `sendMessage` | `(input) => Promise<void>` | メッセージ送信。`{ message: string, document?: string }` |

### `sendMessage` のオプション

| プロパティ | 型 | 説明 |
|---|---|---|
| `message` | `string` | ユーザーの指示テキスト（必須） |
| `document` | `string` | 参照ドキュメント。フォーム入力の元データとして LLM に渡される（オプション） |

`document` を渡すと、LLM はドキュメントの内容を元にフォームフィールドを自動入力します。
例えば議事録のテキストを渡して「このドキュメントの内容でフォームを埋めて」と指示できます。

## 動作確認

1. `pnpm dev` で Next.js を起動
2. ブラウザでページを開く
3. ステータスが `connected` になるのを確認
4. チャット欄に `Fill title with "Hello World" and select category "Blog Post"` と入力して Send

## トラブルシューティング

### Bridge が `connecting` のまま進まない

- Redis の接続 URL が正しいか確認してください
- `REDIS_URL` 等の環境変数がサーバーサイドで読めているか確認してください

### `NO_BROWSER` エラー

- ブラウザが SSE 接続を確立する前に Gemini CLI がリクエストを送っています
- ページをリロードして Bridge が `connected` になってからチャットを送信してください

### Sandbox 内でビルドエラー

- `RPA_SANDBOX_SNAPSHOT_ID` のスナップショットに `packages/mcp-server` と `packages/rpa-planner` のビルド済みファイルが含まれているか確認してください
- または `RPA_SKIP_SANDBOX_BUILD=false` にして Sandbox 内でビルドを実行させてください

### `TIMEOUT` エラー

- Bridge のデフォルトタイムアウトは 20 秒です
- ブラウザがバックグラウンドタブになっていると SSE 接続が不安定になることがあります

## パッケージ構成

```
@giselles/rpa-sdk        — コア (snapshot, execute, 型定義, Zod スキーマ)
@giselles/rpa-bridge     — Bridge 統合
  ├── /react             — useBridge() hook
  └── /next              — createBridgeRoutes(), bridge-broker, chat-handler
@giselles/rpa-planner    — LLM によるアクション計画
@giselles/mcp-server     — Gemini CLI 用 MCP Server
```

すべての型と Zod スキーマは `@giselles/rpa-sdk` が Single Source of Truth です。
他のパッケージは re-export しています。
