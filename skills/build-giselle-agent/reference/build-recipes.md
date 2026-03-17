# Build Recipes

Choose the closest recipe and adapt it. Avoid inventing a new shape unless necessary.

## 1. Workspace report

Use this when the main story is inspectable files, artifacts, and downloads.

Reference: `examples/workspace-report-demo`

### Build this shape when

- the agent should read seeded files
- the agent should write report-style outputs
- you want artifact links in the UI
- you want to demonstrate persistence across turns

### Core ingredients

- seed files under `./workspace/`
- have the agent write outputs like `./artifacts/report.md`
- surface discovered artifacts in the UI
- keep the same session so a second turn can revise existing artifacts

### Good prompt to the coding agent

```text
Build a Next.js app like examples/workspace-report-demo. Seed a sandbox workspace, let the agent read those files, generate report artifacts under ./artifacts/, and show download links in the UI. Keep the session stable so a follow-up prompt can revise the existing files instead of starting over.
```

## 2. Agent inbox

Use this when the main story is a real product-style chat surface.

Reference: `examples/agent-inbox`

### Build this shape when

- the app should feel like a real chat product
- auth or chat history matters
- Slack may be added later
- the runtime should be reusable across web and team surfaces

### Core ingredients

- two-pane or multi-chat UI
- stable session handling
- `@giselles-ai/agent` and `@giselles-ai/giselle-provider`
- optional auth and Slack wiring if the user asks for them

### Good prompt to the coding agent

```text
Build an OpenClaw-like chat app on Next.js using the Giselle Sandbox Agent stack, similar to examples/agent-inbox. Use a real chat surface with stable sessions, keep the runtime legible, and explain where files or artifacts would live if the agent produces outputs.
```

## 3. Browser-tool app

Use this when the main story is explicit DOM interaction.

Reference: `docs/01-getting-started/02-02-building-spreadsheet-agent.md`

### Build this shape when

- the agent must fill forms, click buttons, or inspect the DOM
- the app needs visible browser-tool behavior
- the user wants an agent that acts on the page, not only in chat

### Core ingredients

- `@giselles-ai/browser-tool`
- `browserTools` in the server route
- `useBrowserToolHandler()` in the client
- predictable `data-browser-tool-id` values
- `agentMd` that describes the page structure precisely

### Good prompt to the coding agent

```text
Create a Next.js app with Giselle browser tools. The agent should inspect the page, interact with elements tagged by data-browser-tool-id, and report its actions through a visible chat UI. Keep the app deployable on Vercel and explain the persistence model.
```

## 4. Local parity / runner flow

Use this when the user wants a local build/run loop or parity with both providers.

Reference: `examples/embedded-browser-agent`

### Build this shape when

- the team wants to test `codex` and `gemini`
- the app should run against a local runner
- environment variables and local parity matter more than product polish

### Core ingredients

- `AGENT_TYPE`
- `GISELLE_AGENT_API_KEY`
- `GISELLE_AGENT_BASE_URL`
- explicit docs for build/run parity

## Recipe selection guidance

- If the user cares most about files, choose `workspace-report`
- If the user cares most about product surface, choose `agent-inbox`
- If the user cares most about acting on the page, choose `browser-tool`
- If the user cares most about local validation, choose `local parity`
