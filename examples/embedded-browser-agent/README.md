# minimum-demo

Spreadsheet demo app for exercising the local `cloud-chat-runner`.

## Setup

1. Start the runner on port `3001`.
2. Copy `.env.example` to `.env.local`.
3. Set `AGENT_TYPE` to `gemini` or `codex`.

Required demo env:

- `AGENT_TYPE`
- `GISELLE_AGENT_API_KEY`
- `GISELLE_AGENT_BASE_URL`

## Run locally

```bash
pnpm --dir apps/minimum-demo dev
```

With the default `.env.example` values the app connects to:

- `http://localhost:3001/agent-api/build`
- `http://localhost:3001/agent-api/run`

Switch `AGENT_TYPE` between `gemini` and `codex` to verify both runtime paths against the same runner.
