# Current Capabilities

Use this file to understand the current Giselle Sandbox Agent model before generating or updating code.

## Product shape

Giselle Sandbox Agent is for building OpenClaw-like agent experiences on Vercel without hiding the runtime behind a black box.

The product story is strongest when the app makes these things visible:

- the agent can create or update files
- those files live in a real sandbox workspace
- user-facing outputs are surfaced as artifacts
- snapshots preserve continuity when a live sandbox expires

## Core runtime model

- `gemini` or `codex` runs inside Vercel Sandbox
- `giselle({ agent })` exposes that runtime as a normal AI SDK model
- `defineAgent({ agentType, agentMd, files, setup, env })` is the main configuration surface
- `withGiselleAgent(...)` builds the sandbox snapshot during Next.js dev/build

## Workspace and artifacts

- Seed inputs or working files can live in the sandbox workspace, commonly under `./workspace/`
- User-facing deliverables should be written under `./artifacts/`
- The runtime scans `./artifacts/` after turns and emits artifact metadata
- Artifact download flows can be exposed through `/agent-api/files?...`

## Snapshot continuity

- A conversation can persist the latest filesystem state as a snapshot
- If the live sandbox expires, the session can recover from the latest snapshot
- This is the continuity story you should preserve when building or updating apps

## Browser tools

Use browser tools only when the agent needs explicit DOM access.

The pattern is:

- `browserTools` on the server
- `useBrowserToolHandler()` on the client
- `data-browser-tool-id` on elements the agent should inspect or manipulate
- a prompt in `agentMd` that describes the page structure precisely

## Supported product shapes in this skill

- `workspace-report`: seeded workspace files, generated artifacts, download links, and follow-up revision turns
- `agent-inbox`: product-style chat surface with stable sessions and optional team-facing extensions
- `browser-tool`: visible DOM interaction through chat-driven tool use
- `local parity`: local runner or provider parity with explicit environment configuration

## Quality bar

When using this skill, prefer outcomes that are:

- legible to the user
- grounded in real files
- reviewable through normal code diffs
- deployable as a Next.js app on Vercel
