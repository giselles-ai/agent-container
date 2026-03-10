# Architecture

CLI agents like Gemini CLI and Codex CLI are powerful — they can write code, run commands, and reason through complex tasks. But they are designed to run in a terminal on your machine, not inside a web application served to thousands of users.

Giselle Agent SDK bridges that gap. It takes these terminal-native agents, runs them in isolated cloud sandboxes, and exposes them through the same `streamText` and `useChat` interfaces you already use with any other AI model.

This page walks through how that works.

---

## The Big Picture

A single user message travels through four layers before a CLI agent processes it, and the response streams back the same path in reverse:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Browser                                                               │
│  ┌──────────┐   ┌───────────────────┐   ┌─────────────────────────┐    │
│  │ useChat  │──▶│ useBrowserTool    │──▶│ DOM (snapshot/execute)  │    │
│  │ (AI SDK) │◀──│ Handler           │◀──│                         │    │
│  └──────────┘   └───────────────────┘   └─────────────────────────┘    │
└───────────────────────────┬────────────────────────────────────────────┘
                            │  HTTP (chat messages)
                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Your Next.js Server                                                   │
│  ┌──────────────────┐   ┌──────────────────────────────────────┐       │
│  │ Route Handler    │──▶│ streamText(model: giselle({ agent }))│       │
│  │ app/chat/route.ts│◀──│ + browserTools                       │       │
│  └──────────────────┘   └──────────────────────────────────────┘       │
└──────────────────────────┬─────────────────────────────────────────────┘
                            │  HTTPS + Bearer token
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Giselle Cloud API  (or self-hosted)                                 │
│  ┌───────────┐   ┌──────────────┐   ┌──────────────────────────┐     │
│  │ /auth     │   │ /build       │   │ /run                     │     │
│  │ /relay    │   │ (snapshots)  │   │ (chat orchestration)     │     │
│  └───────────┘   └──────────────┘   └──────────┬───────────────┘     │
│                                                │                     │
│  ┌───────────────────────┐   ┌─────────────────▼──────────────────┐  │
│  │ Redis                 │   │ Vercel Sandbox                     │  │
│  │ (session state,       │   │ ┌──────────────┐  ┌──────────────┐ │  │
│  │  relay pub/sub)       │   │ │ Gemini CLI   │  │ MCP Server   │ │  │
│  └───────────────────────┘   │ │ or Codex CLI │  │ (browser-    │ │  │
│                              │ │              │──│  tool relay) │ │  │
│                              │ └──────────────┘  └──────────────┘ │  │
│                              └────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

What makes this interesting is what happens at each boundary — and how much work goes into making the developer-facing API feel like an ordinary model call.

---

## Layer 1: The Provider — Making a CLI Agent Look Like a Model

The Vercel AI SDK expects a model object that implements `LanguageModelV3`. When you write:

```ts
streamText({
  model: giselle({ agent }),
  messages: await convertToModelMessages(messages),
});
```

…the SDK calls `model.doStream()` and expects back a `ReadableStream<LanguageModelV3StreamPart>`. It doesn't know or care that there's a CLI agent behind it.

`GiselleAgentModel` makes that work. It implements the `LanguageModelV3` interface, which means it must speak the SDK's protocol: text deltas, tool calls, finish reasons, usage metadata.

Under the hood, `doStream()` does the following:

1. Extracts the latest user message and any tool results from the AI SDK prompt
2. Sends a `POST` request to the Cloud API `/run` endpoint (NDJSON streaming)
3. Parses each NDJSON event and maps it to `LanguageModelV3StreamPart` objects

The NDJSON mapper handles the translation between two worlds:

| Cloud API Event | AI SDK Stream Part |
|---|---|
| `{ type: "message", role: "assistant", content: "...", delta: true }` | `text-start` → `text-delta` → `text-end` |
| `{ type: "snapshot_request", requestId: "..." }` | `tool-call` (toolName: `getFormSnapshot`) + `finish` (reason: `tool-calls`) |
| `{ type: "execute_request", requestId: "..." }` | `tool-call` (toolName: `executeFormActions`) + `finish` (reason: `tool-calls`) |
| `{ type: "init", session_id: "..." }` | `response-metadata` |
| (stream ends) | `finish` (reason: `stop`) |

This mapping is the core of the illusion. To the AI SDK — and to your application code — it looks like any other streaming language model. The fact that the "model" is actually a CLI process running `gemini` or `codex` inside a Linux sandbox is completely hidden.

---

## Layer 2: The Sandbox — Running CLI Agents in the Cloud

A CLI agent needs a real environment: a filesystem to read and write, a shell to execute commands, and network access for API calls. You can't just invoke it as a function.

Giselle uses **Vercel Sandbox** — an isolated, ephemeral Linux VM — as the execution environment. Each agent session gets its own sandbox with a full Node.js runtime.

### How a Sandbox Gets Built

Before any conversation can happen, a sandbox **snapshot** must exist. A snapshot is a pre-configured VM image with everything the agent needs already installed. Building one involves:

```
Empty Sandbox (Node 24)
  │
  ├─ npm install -g @google/gemini-cli
  ├─ npm install -g @openai/codex
  │  ▲
  │  └─ Base Snapshot (cached — reusable across all agents)
  │
  ├─ npm install -g @giselles-ai/browser-tool
  │
  ├─ Write ~/.gemini/settings.json     ◀─ Configures MCP server for browser tools
  ├─ Write ~/.codex/config.toml        ◀─ Same, for Codex
  │
  └─ snapshot()  →  snapshotId: "snap_abc123..."
```

The key insight: **snapshot building is expensive** (installing CLIs, compiling native modules) but it only happens once. After that, creating a new sandbox from the snapshot takes seconds.

### How a Conversation Runs

When the Cloud API receives a `/run` request:

1. **Resume or create**: If the session has an existing `sandboxId`, the same sandbox is resumed (the agent keeps its filesystem state between turns). Otherwise, a new sandbox is created from the snapshot.

2. **Prepare**: The agent's `AGENTS.md` (your system prompt) and any additional files are written into the sandbox filesystem.

3. **Execute**: The CLI command runs — for example:
   ```
   gemini -m gemini-2.5-pro --sandbox-prompt "Fill in the email field with alice@example.com"
   ```

4. **Stream stdout**: The CLI's stdout is piped through a `Writable` stream. Each line is emitted as an NDJSON event back to the provider.

5. **Session persists**: The `sandboxId` is saved to Redis so the next turn in the conversation reuses the same sandbox, preserving the agent's memory and filesystem changes.

```
Turn 1:  create sandbox → run CLI → save sandboxId to Redis
Turn 2:  load sandboxId → resume sandbox → run CLI → save state
Turn 3:  load sandboxId → resume sandbox → run CLI → save state
  ...
```

This statefulness is what makes multi-turn conversations work. The agent remembers what files it wrote, what commands it ran, and what it was working on.

---

## Layer 3: Browser Tools — Crossing the Sandbox Boundary

Here's the hard problem: the agent runs in an isolated sandbox in the cloud, but it needs to interact with DOM elements in the user's browser. Those two environments have no direct connection.

The `@giselles-ai/browser-tool` package solves this with a **relay architecture** that bridges three separate processes:

```
┌─────────────────────┐         ┌───────────────────┐         ┌──────────────────────┐
│  Sandbox            │         │  Cloud API Server │         │  User's Browser      │
│                     │         │                   │         │                      │
│  CLI Agent          │         │  Relay Handler    │         │  React App           │
│    │                │         │  (Redis pub/sub)  │         │    │                 │
│    ▼                │         │                   │         │    ▼                 │
│  MCP Server         │  HTTP   │    ┌──────────┐   │   SSE   │  useBrowserTool      │
│  (browser-tool)     │────────▶│    │ dispatch │   │────────▶│  Handler             │
│                     │         │    └──────────┘   │         │    │                 │
│                     │         │                   │         │    ▼                 │
│                     │  HTTP   │    ┌──────────┐   │  HTTP   │  DOM snapshot()      │
│  (receives response)│◀────────│    │ respond  │   │◀────────│  DOM execute()       │
│                     │         │    └──────────┘   │         │                      │
└─────────────────────┘         └───────────────────┘         └──────────────────────┘
```

### The Relay Flow in Detail

**Step 1 — Agent wants to see the page.**
The CLI agent calls the `getFormSnapshot` MCP tool. The MCP server (running inside the sandbox) sends an HTTP request to the relay handler.

**Step 2 — Request crosses to the browser.**
The relay handler publishes the request to a Redis channel. The user's browser, connected via SSE, receives it. But here's the trick: this request doesn't just go to the browser — it surfaces as an AI SDK **tool call** in the NDJSON stream. The provider maps it to a `tool-call` stream part, and the AI SDK's `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` triggers the round-trip automatically.

**Step 3 — Browser executes the tool.**
The `useBrowserToolHandler` React hook intercepts the tool call. For `getFormSnapshot`, it scans the DOM for all `input`, `textarea`, and `select` elements, building a structured list of fields with their current values, labels, and CSS selectors. For `executeFormActions`, it performs the requested clicks, fills, and selections directly on the DOM.

**Step 4 — Response flows back.**
The tool output travels back through the AI SDK's normal tool result mechanism → the provider sends it to the Cloud API → the relay handler delivers it to the MCP server in the sandbox → the CLI agent receives the result and continues its reasoning.

### What the Agent Actually Sees

When the agent calls `getFormSnapshot`, it receives a JSON structure like this:

```json
{
  "fields": [
    {
      "fieldId": "bt:email-field",
      "selector": "[data-browser-tool-id=\"email-field\"]",
      "kind": "text",
      "label": "Email Address",
      "required": true,
      "placeholder": "you@example.com",
      "currentValue": ""
    },
    {
      "fieldId": "bt:plan-select",
      "selector": "[data-browser-tool-id=\"plan-select\"]",
      "kind": "select",
      "label": "Plan",
      "options": ["Free", "Pro", "Enterprise"],
      "currentValue": "Free"
    }
  ]
}
```

The agent reasons about these fields, decides what actions to take, and calls `executeFormActions` with specific instructions — all without ever seeing a screenshot or pixel data. This structured representation is much more reliable than vision-based approaches.

---

## Layer 4: Session State — Making It All Stateful

A multi-turn conversation with browser tools requires careful state management across several dimensions:

| State | Stored In | Purpose |
|---|---|---|
| Sandbox ID | Redis | Resume the same VM across turns |
| Snapshot ID | Redis | Recreate the sandbox if it has expired |
| Agent session ID | Redis | Continue the CLI agent's session (Gemini's `--session_id`) |
| Relay session | Redis | Maintain the SSE connection for browser tools |
| Pending tool state | Redis | Track in-progress tool calls across request boundaries |
| Chat history | AI SDK (client) | Message history managed by `useChat` |

The `CloudChatStateStore` interface (backed by Redis) persists everything the system needs to pause a conversation — even mid-tool-call — and resume it seamlessly on the next request.

When a browser tool request arrives, the system **pauses** the NDJSON stream, saves the reader state and buffer position, and closes the HTTP response. When the tool result comes back in a new request, it **resumes** from exactly where it left off — reconnecting to the same sandbox and replaying the tool result to the CLI agent.

Sandbox expiration is handled transparently. After each agent turn, a new snapshot is captured and its ID is persisted to the store alongside the sandbox ID. If a sandbox has expired when the next turn begins, the system recreates it from the last snapshot—preserving the agent's filesystem state while obtaining a fresh VM. This means applications only need to track a `sessionId` (the chat ID); the store handles all infrastructure state recovery automatically.

---

## The Build Pipeline — `withGiselleAgent`

All of this machinery needs a snapshot ID before it can run. The `withGiselleAgent` Next.js plugin automates this:

```
next dev / next build
      │
      ▼
withGiselleAgent(nextConfig, agent)
      │
      ├─ Authenticate (POST /auth with API key)
      │
      ├─ Request build (POST /build with agent config)
      │    └─ Cloud API creates sandbox, installs CLIs,
      │       writes AGENTS.md, snapshots → returns snapshotId
      │
      ├─ Cache snapshotId to .next/giselle/<hash>
      │
      └─ Inject GISELLE_AGENT_SNAPSHOT_ID into Next.js env
            └─ defineAgent() reads it at runtime
```

After the first build, the snapshot ID is cached. Subsequent `next dev` starts skip the build entirely. The content hash is computed from `agentType`, `agentMd`, and `files` — so the snapshot is only rebuilt when your agent definition actually changes.

---

## Package Map

Each package owns a clear boundary:

```
@giselles-ai/agent              Your app's entry point
  ├─ defineAgent()               Define agent config
  ├─ withGiselleAgent()          Next.js build plugin
  ├─ Agent runtime               Sandbox lifecycle, CLI execution
  └─ Cloud chat state            Redis-backed session persistence

@giselles-ai/giselle-provider   Vercel AI SDK integration
  ├─ giselle()                   Create LanguageModelV3 provider
  ├─ GiselleAgentModel           Model implementation (doStream)
  └─ NDJSON mapper               Cloud events → AI SDK stream parts

@giselles-ai/browser-tool       Browser interaction bridge
  ├─ MCP Server                  Runs inside sandbox, exposes tools
  ├─ Relay handler               SSE + HTTP bridge (Redis pub/sub)
  ├─ DOM snapshot/executor       Runs in browser, reads/writes DOM
  └─ useBrowserToolHandler()     React hook for useChat integration

@giselles-ai/agent-kit          Sandbox provisioning
  ├─ buildSnapshot()             Create sandbox images
  └─ CLI                         `agent-kit build-snapshot`
```

---

## Self-Hosting vs. Cloud API

Everything described above — the sandbox orchestration, Redis state management, relay infrastructure, snapshot building — is what the **Cloud API** handles for you. When you set `GISELLE_AGENT_API_KEY` and call `giselle({ agent })`, your application talks to `studio.giselles.ai`, which runs the entire backend.

To self-host, you'd need:

| Component | What You Provision |
|---|---|
| Vercel Sandbox | Sandbox API access with `VERCEL_SANDBOX_API_KEY` |
| Redis | Persistent instance for session state and relay pub/sub |
| Agent API | Deploy `createAgentApi()` as a server (or Next.js route) |
| Snapshot cache | Pre-build snapshots with `agent-kit build-snapshot` |
| Environment | `GEMINI_API_KEY` or `CODEX_API_KEY`, relay URL config |

The SDK is designed so that the Cloud API and self-hosted API share the same interface — your application code doesn't change. The only difference is where `GISELLE_AGENT_BASE_URL` points.

The Cloud API exists because setting all this up is real infrastructure work. If you want to focus on building your agent's behavior rather than managing sandboxes and Redis, it's the fastest path.
