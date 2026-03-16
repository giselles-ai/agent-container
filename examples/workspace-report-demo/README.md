# workspace-report-demo

Next.js demo that makes the workspace story concrete.

It shows how `defineAgent({ files })` seeds a sandbox workspace with source files, how the agent reads those files on first run, and how it writes durable user-facing outputs back into `./artifacts/`.

## What this demo proves

- The agent starts with a real seeded workspace, not just chat history.
- Workspace inputs live under `./workspace/`.
- User-facing outputs are written under `./artifacts/`.
- Artifact download links are surfaced through the Agent API file endpoint for the current session.
- A follow-up prompt can revise the existing report artifacts instead of starting over from scratch.

## Workspace layout

```text
workspace/
├── brief.md
├── data/
│   ├── sales.csv
│   └── customers.json
└── notes/
    └── internal-notes.md
```

The agent is instructed to:

1. Inspect the files under `./workspace/`
2. Write the main report to `./artifacts/report.md`
3. Write a machine-readable summary to `./artifacts/highlights.json`
4. Mention the output paths in its reply

## Setup

1. Start the Giselle runner on port `3001`.
2. Copy [`.env.example`](./.env.example) to `.env.local`.
3. Set `AGENT_TYPE` to `gemini` or `codex`.
4. Fill in `GISELLE_AGENT_API_KEY`.

Required environment variables:

- `AGENT_TYPE`
- `GISELLE_AGENT_API_KEY`
- `GISELLE_AGENT_BASE_URL`

Optional environment variables:

- `EXTERNAL_AGENT_API_PROTECTION_BYPASS`

With the default `.env.example` values the app connects to:

- `http://localhost:3001/agent-api/build`
- `http://localhost:3001/agent-api/run`

## Run locally

```bash
pnpm --dir examples/workspace-report-demo dev
```

Then open `http://localhost:3000`.

## Try it

Start with:

```text
Read the workspace files and create the weekly report plus highlights JSON.
```

Then follow with a revision request such as:

```text
Update the existing report to make the executive summary tighter and more board-ready.
```

That second turn is important: it demonstrates that the agent is working against a persistent workspace and existing artifacts, not only the current chat message.

## Expected result

After the first prompt:

- the agent reads the seeded files from `./workspace/`
- the agent writes `./artifacts/report.md`
- the agent writes `./artifacts/highlights.json`
- the UI shows discovered artifact download links for the current session

After the second prompt:

- the agent revises the existing files in `./artifacts/`
- the response should mention the updated output paths explicitly

## Relevant files

- [`lib/agent.ts`](./lib/agent.ts): seeds the sandbox workspace and defines artifact-writing behavior
- [`app/page.tsx`](./app/page.tsx): previews the files that are copied into the workspace
- [`app/chat-panel.tsx`](./app/chat-panel.tsx): chat UI plus artifact discovery and download links
- [`app/chat/route.ts`](./app/chat/route.ts): AI SDK route that runs the agent with a stable session ID
