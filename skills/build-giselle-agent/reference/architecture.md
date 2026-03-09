# Architecture Overview

CLI agents like Gemini CLI and Codex CLI are powerful — they can write code, run commands, and reason through complex tasks. But they are designed to run in a terminal, not inside a web application. Giselle Agent SDK bridges that gap by running them in isolated cloud sandboxes and exposing them through `streamText` and `useChat`.

---

## The Big Picture

```
Browser
  useChat ──▶ useBrowserToolHandler ──▶ DOM (snapshot/execute)
     │
     │ HTTP (chat messages)
     ▼
Your Next.js Server
  Route Handler ──▶ streamText(model: giselle({ agent })) + browserTools
     │
     │ HTTPS + Bearer token
     ▼
Giselle Cloud API (or self-hosted)
  /auth, /build (snapshots), /run (chat orchestration)
     │
     ├── Redis (session state, relay pub/sub)
     └── Vercel Sandbox
           ├── Gemini CLI or Codex CLI
           └── MCP Server (browser-tool relay)
```

---

## Key Concepts

### The Provider — Making a CLI Agent Look Like a Model

`giselle({ agent })` returns a `LanguageModelV3` object. The AI SDK calls `model.doStream()` and gets back a `ReadableStream<LanguageModelV3StreamPart>`. Under the hood, `doStream()`:

1. Sends a POST request to the Cloud API `/run` endpoint (NDJSON streaming)
2. Maps each NDJSON event to AI SDK stream parts (text deltas, tool calls, finish reasons)

| Cloud API Event | AI SDK Stream Part |
|---|---|
| `message` (delta) | `text-start` → `text-delta` → `text-end` |
| `snapshot_request` | `tool-call` (`getFormSnapshot`) + `finish` (tool-calls) |
| `execute_request` | `tool-call` (`executeFormActions`) + `finish` (tool-calls) |

### The Sandbox

Each agent session runs in a **Vercel Sandbox** — an isolated Linux VM. A **snapshot** is built once (installing CLIs, writing AGENTS.md) and cached. New sandboxes from the snapshot start in seconds.

Conversations are stateful: the same `sandboxId` is reused across turns via Redis, preserving the agent's memory and filesystem.

### Browser Tools — Crossing the Sandbox Boundary

The agent in the sandbox needs to interact with the user's browser DOM. The relay architecture bridges this:

1. **Agent calls `getFormSnapshot`** → MCP Server in sandbox → HTTP to relay → Redis pub/sub → SSE to browser
2. **Browser scans DOM** for `data-browser-tool-id` elements → returns snapshot
3. **Agent calls `executeFormActions`** → same relay path → browser executes fill/click/select on DOM
4. **Results flow back** through AI SDK tool result mechanism → relay → sandbox

### The Build Pipeline — `withGiselleAgent`

The Next.js plugin automates snapshot creation:

1. Authenticates with Cloud API
2. Builds sandbox snapshot (installs CLIs, writes AGENTS.md)
3. Caches `snapshotId` to `.next/giselle/<hash>`
4. Injects `GISELLE_AGENT_SNAPSHOT_ID` into Next.js env

The snapshot is only rebuilt when `agentType`, `agentMd`, or `files` change.

---

## Packages

| Package | Purpose |
|---|---|
| `@giselles-ai/agent` | `defineAgent()`, `withGiselleAgent()`, sandbox lifecycle |
| `@giselles-ai/giselle-provider` | `giselle()` — LanguageModelV3 provider, NDJSON mapper |
| `@giselles-ai/browser-tool` | MCP Server, relay handler, DOM snapshot/executor, `useBrowserToolHandler()` |
| `ai` / `@ai-sdk/react` | Vercel AI SDK (`streamText`, `useChat`, etc.) |
