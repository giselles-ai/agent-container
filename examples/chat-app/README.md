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

### Slack Setup

1. Configure the Slack and Redis environment variables:
   - `SLACK_BOT_TOKEN` (required)
   - `SLACK_SIGNING_SECRET` (required)
   - `REDIS_URL` (required)
   - `SLACK_BOT_USERNAME` (optional)
   - `SLACK_HISTORY_LIMIT` (optional, default `20`)
2. Expose `POST /api/webhooks/slack`.
3. Set Slack Event Subscriptions and Interactivity URLs to your deployed webhook URL.
4. Invite the bot to a channel and mention it to subscribe the thread.
5. Continue replying in-thread for multi-turn conversations.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | libSQL database URL |
| `DATABASE_AUTH_TOKEN` | libSQL auth token (for remote DB) |
| `REDIS_URL` | Redis URL for Chat SDK state (`subscriptions`, locks, dedupe) |
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-...`) for single-workspace mode |
| `SLACK_SIGNING_SECRET` | Slack webhook signing secret |
| `SLACK_BOT_USERNAME` | Optional override for bot user name |
| `SLACK_HISTORY_LIMIT` | Optional limit for Slack thread messages assembled into prompts |

Current Slack integration streams text replies only.
Slack conversation transcripts are not persisted to the app database.

### Development Server

```bash
pnpm dev
```

## Slack Verification

| Check | Expected result |
|---|---|
| `GET /api/webhooks/slack` | returns `200` with active webhook response |
| First Slack mention in a channel thread | bot subscribes and replies text-only |
| Follow-up Slack reply in subscribed thread | `onSubscribedMessage` handles it |
