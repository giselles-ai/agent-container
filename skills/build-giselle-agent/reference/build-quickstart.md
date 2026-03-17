# Build Quickstart

Use this when creating a new Giselle Sandbox Agent app or integrating the runtime into an existing Next.js app.

## Minimum implementation path

1. Install the runtime packages
2. Define the agent
3. Wrap Next.js with `withGiselleAgent(...)`
4. Add a streaming chat route
5. Add a UI that exposes the intended agent workflow

## Required packages

```bash
pnpm add @giselles-ai/agent @giselles-ai/giselle-provider ai @ai-sdk/react
```

Add browser tools only if the app actually needs DOM interaction:

```bash
pnpm add @giselles-ai/browser-tool
```

## API key

Create a `.env.local` with:

```env
GISELLE_AGENT_API_KEY=<your-api-key>
```

Default Cloud API is `studio.giselles.ai`. Only configure a different base URL for self-hosted or local-runner setups.

## Required files

- `lib/agent.ts`
- `next.config.ts`
- a chat route such as `app/chat/route.ts`
- `app/page.tsx` or another app surface that makes the agent useful

## Core implementation contract

- `defineAgent(...)` should reflect the actual app shape
- `agentMd` should describe the workspace, tool use, and constraints clearly
- if seeded files are required, place them with `files`
- outputs intended for users should be written to `./artifacts/`

## What "done" looks like

A new app is minimally ready when:

- `pnpm dev` triggers the Giselle snapshot build
- the app can send a chat message to the agent
- at least one concrete workflow is visible
- the end user can understand where outputs live
