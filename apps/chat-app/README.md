# Chat App

Giselle Agent SDKを使って、ChatGPTやClaudeのようなChat UIでCodexとチャットができるアプリケーションです。

## 機能

- **認証**: メールアドレス / パスワードによるアカウント作成・ログイン（`route06.co.jp` ドメインのみ）
- **Chat UI**: ログイン後に2ペインのUIを表示
  - 左ペイン: ナビゲーションバー（新規チャット作成、過去のチャット一覧、設定）
  - メインペイン: Chat UI

## 技術スタック

- **Framework**: Next.js 16 (App Router)
- **AI**: Giselle Agent SDK (`@giselles-ai/agent`, `@giselles-ai/giselle-provider`) + Vercel AI SDK
- **認証**: better-auth
- **DB**: SQLite (libSQL) + Drizzle ORM
- **スタイリング**: Tailwind CSS v4

## ディレクトリ構成

```
app/
├── layout.tsx              # ルートレイアウト
├── page.tsx                # リダイレクトハブ（→ /chats or /signin）
├── (auth)/
│   ├── signin/page.tsx     # ログインページ
│   └── signup/page.tsx     # アカウント作成ページ
├── (main)/
│   ├── layout.tsx          # 2ペインレイアウト（サイドバー + メイン）
│   └── chats/
│       ├── page.tsx        # 新規チャット画面
│       └── [id]/page.tsx   # チャット詳細画面
├── api/
│   ├── auth/[...all]/route.ts  # better-auth APIハンドラ
│   └── chat/route.ts       # Chat APIエンドポイント
proxy.ts                    # Next.js 16 認証プロキシ
db/
├── client.ts               # Drizzle クライアント
├── schemas/                # テーブル定義
└── relations/              # リレーション定義
lib/
├── agent.ts                # Giselle Agent定義
├── auth.ts                 # better-auth設定
└── base-url.ts             # 環境に応じたBase URL解決
```

## セットアップ

```bash
pnpm install
```

### 環境変数

| 変数名 | 説明 |
|---|---|
| `DATABASE_URL` | libSQL データベースURL |
| `DATABASE_AUTH_TOKEN` | libSQL 認証トークン（リモートDB使用時） |

### 開発サーバー

```bash
pnpm dev
```
