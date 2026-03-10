# Chat App

A chat application that lets you converse with Codex through a ChatGPT/Claude-like Chat UI, powered by the Giselle Agent SDK.

## Features

- **Authentication**: Account creation and sign-in via email/password (`route06.co.jp` domain only)
- **Chat UI**: Two-pane UI after login
  - Left pane: Navigation bar (new chat, chat history, settings)
  - Main pane: Chat UI

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **AI**: Giselle Agent SDK (`@giselles-ai/agent`, `@giselles-ai/giselle-provider`) + Vercel AI SDK
- **Auth**: better-auth
- **DB**: SQLite (libSQL) + Drizzle ORM
- **Styling**: Tailwind CSS v4

## Directory Structure

```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Redirect hub (→ /chats or /signin)
├── (auth)/
│   ├── signin/page.tsx     # Sign-in page
│   └── signup/page.tsx     # Sign-up page
├── (main)/
│   ├── layout.tsx          # Two-pane layout (sidebar + main)
│   └── chats/
│       ├── page.tsx        # New chat screen
│       └── [id]/page.tsx   # Chat detail screen
├── api/
│   ├── auth/[...all]/route.ts  # better-auth API handler
│   └── chat/route.ts       # Chat API endpoint
proxy.ts                    # Next.js 16 auth proxy
db/
├── client.ts               # Drizzle client
├── schemas/                # Table definitions
└── relations/              # Relation definitions
lib/
├── agent.ts                # Giselle Agent definition
├── auth.ts                 # better-auth configuration
└── base-url.ts             # Environment-based base URL resolution
```

## Setup

```bash
pnpm install
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | libSQL database URL |
| `DATABASE_AUTH_TOKEN` | libSQL auth token (for remote DB) |

### Development Server

```bash
pnpm dev
```
