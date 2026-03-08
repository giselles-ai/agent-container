# cloud-chat-runner

Next.js API app that exposes the local cloud-chat runtime used by `apps/minimum-demo`.

## Required env

Copy `.env.example` and set:

- `GISELLE_AGENT_API_KEY`
- `GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID`
- `REDIS_URL`
- `GEMINI_API_KEY`
- `CODEX_API_KEY`

## Run locally

```bash
pnpm --dir apps/cloud-chat-runner dev
```

The app listens on [http://localhost:3001](http://localhost:3001) and exposes:

- `POST /agent-api/build`
- `POST /agent-api/run`
- `GET/POST/OPTIONS /agent-api/relay/[[...relay]]`
