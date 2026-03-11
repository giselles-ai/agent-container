# Phase 2: Demo & Docs

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1 (build pipeline must be functional)
> **Blocks:** None

## Objective

Update the chat-app demo to use `setup.script`, update existing documentation to cover the new feature, and create an API reference page for `defineAgent`.

## Deliverables

### 1. `apps/chat-app/lib/agent.ts` — Add setup script to the demo

```ts
import { defineAgent } from "@giselles-ai/agent";

const agentMd = `You are a helpful assistant`;
export const agent = defineAgent({
  agentType: "gemini",
  agentMd,
  setup: {
    script: `npx opensrc vercel/ai`,
  },
});
```

### 2. `docs/01-getting-started/01-01-getting-started.md` — Add setup section

**In Step 3** (after the existing `defineAgent` code block, around line 63), add:

```markdown
### Customizing the sandbox environment

You can run shell commands inside the sandbox at build time using `setup.script`. This is useful for pre-installing tools, fetching reference documentation, or setting up dependencies:

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: `
You are a Next.js expert. Reference documentation is available in opensrc/.
  `,
  setup: {
    script: `
npx opensrc vercel/ai
npm install -g tsx
    `,
  },
});
\```

The script runs as `bash` inside the sandbox during the build phase — after files are written and before the snapshot is taken. It only re-runs when your agent definition changes.
```

**In "Next steps"** (line 218), replace the "Add files" bullet with:

```markdown
- **Customize the sandbox environment** — Use `setup.script` to install tools, fetch docs, or set up dependencies in the agent's sandbox at build time. See the [`defineAgent` API reference](../02-api-reference/02-01-define-agent.md).
```

### 3. `docs/03-architecture/03-01-architecture.md` — Update build pipeline

**In "How a Sandbox Gets Built"** (lines 99–115), replace the build diagram with:

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
  ├─ Write AGENTS.md + user files      ◀─ From defineAgent({ agentMd, files })
  │
  ├─ Run setup script                  ◀─ From defineAgent({ setup: { script } })
  │  e.g. npx opensrc vercel/ai
  │       npm install -g tsx
  │
  └─ snapshot()  →  snapshotId: "snap_abc123..."
```

**In "The Build Pipeline"** (lines 296–316), update the diagram to mention setup:

```
next dev / next build
      │
      ▼
withGiselleAgent(nextConfig, agent)
      │
      ├─ Authenticate (POST /auth with API key)
      │
      ├─ Request build (POST /build with agent config)
      │    └─ Cloud API creates sandbox, writes files,
      │       runs setup script, snapshots → returns snapshotId
      │
      ├─ Cache snapshotId to .next/giselle/<hash>
      │
      └─ Inject GISELLE_AGENT_SNAPSHOT_ID into Next.js env
            └─ defineAgent() reads it at runtime
```

Update the paragraph after it (line 316) to:

```
After the first build, the snapshot ID is cached. Subsequent `next dev` starts skip the build entirely. The content hash is computed from `agentType`, `agentMd`, `files`, and `setup.script` — so the snapshot is only rebuilt when your agent definition actually changes.
```

### 4. `docs/02-api-reference/02-01-define-agent.md` — Create API reference

Create the directory `docs/02-api-reference/` and the file:

```markdown
# `defineAgent`

Creates an agent definition that configures a CLI agent running inside a cloud sandbox.

## Import

\```ts
import { defineAgent } from "@giselles-ai/agent";
\```

## Signature

\```ts
function defineAgent(config: AgentConfig): DefinedAgent
\```

## `AgentConfig`

| Property | Type | Default | Description |
|---|---|---|---|
| `agentType` | `"gemini" \| "codex"` | `"gemini"` | Which CLI agent to use in the sandbox. |
| `agentMd` | `string` | — | System prompt loaded as `AGENTS.md` / `GEMINI.md` inside the sandbox. Write it like you're briefing a teammate. |
| `files` | `AgentFile[]` | `[]` | Additional files to write into the sandbox at build time. |
| `setup` | `AgentSetup` | — | Setup configuration for the sandbox build phase. |

### `AgentFile`

| Property | Type | Description |
|---|---|---|
| `path` | `string` | Absolute path inside the sandbox (e.g. `/home/vercel-sandbox/data/config.json`). |
| `content` | `string` | File content as a string. |

### `AgentSetup`

| Property | Type | Description |
|---|---|---|
| `script` | `string` | Shell script to run inside the sandbox during build. Executed as `bash -lc`. Runs after file writes, before snapshot. |

## `DefinedAgent`

The return value of `defineAgent()`. Pass it to `withGiselleAgent()` and `giselle()`.

| Property | Type | Description |
|---|---|---|
| `agentType` | `"gemini" \| "codex"` | The resolved agent type. |
| `agentMd` | `string \| undefined` | The system prompt. |
| `files` | `AgentFile[]` | Files to write into the sandbox. |
| `setup` | `AgentSetup \| undefined` | Setup configuration, if provided. |
| `snapshotId` | `string` | The snapshot ID (resolved from `GISELLE_AGENT_SNAPSHOT_ID` env at runtime). Throws if not set. |

## Examples

### Minimal

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: "You are a helpful assistant.",
});
\```

### With reference documentation

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: `
You are a Next.js expert. Reference documentation is available in opensrc/.
Always consult it before answering.
  `,
  setup: {
    script: `
npx opensrc vercel/ai
npx opensrc vercel/next.js
    `,
  },
});
\```

### With pre-installed tools

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: "You can run TypeScript files using tsx.",
  setup: {
    script: `npm install -g tsx`,
  },
});
\```

### With a cloned repository

\```ts
export const agent = defineAgent({
  agentType: "codex",
  agentMd: "You are a contributor to ~/project.",
  setup: {
    script: `
git clone https://github.com/owner/repo.git ~/project
cd ~/project && npm install
    `,
  },
});
\```

### Complex setup with full shell features

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd,
  setup: {
    script: `
eval "$($HOME/.local/bin/mise activate bash --cd $PWD --shims)"
mise trust

bun i
bun x vercel link --cwd packages/web --project my-app --yes
bun x vercel env pull --cwd packages/web
    `,
  },
});
\```

### Files + setup combined

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: "You are a data analyst.",
  files: [
    { path: "/home/vercel-sandbox/config.json", content: JSON.stringify({ theme: "dark" }) },
  ],
  setup: {
    script: `
npx opensrc vercel/ai
npm install -g tsx jq
    `,
  },
});
\```

## How it works

The setup script runs during the **build phase** — when `withGiselleAgent()` calls the build API:

1. A sandbox is created from the base snapshot
2. `agentMd` and `files` are written to the sandbox filesystem
3. The `setup.script` is executed via `bash -lc` (login shell)
4. A snapshot is taken and its ID is cached

The snapshot is only rebuilt when the config hash changes. The hash is computed from `agentType`, `agentMd`, `files`, and `setup.script` — so changing the script triggers a fresh build.

If the script exits with a non-zero code, the build throws an error with the exit code and stderr output.
```

## Verification

1. **Docs review:** Read through each doc file and verify Markdown renders correctly — code blocks, tables, diagrams.

2. **Typecheck:**
   ```bash
   pnpm --filter @giselles-ai/agent exec tsc --noEmit
   ```

3. **Links:** Verify the new `02-api-reference/02-01-define-agent.md` link from Getting Started resolves correctly relative to the docs structure.

## Files to Create/Modify

| File | Action |
|---|---|
| `apps/chat-app/lib/agent.ts` | **Modify** — add `setup.script` |
| `docs/01-getting-started/01-01-getting-started.md` | **Modify** — add setup section in Step 3 + update "Next steps" |
| `docs/03-architecture/03-01-architecture.md` | **Modify** — update build diagrams |
| `docs/02-api-reference/02-01-define-agent.md` | **Create** — full API reference |

## Done Criteria

- [ ] chat-app demo uses `setup.script` with at least one command
- [ ] Getting Started guide mentions `setup.script` in Step 3 and "Next steps"
- [ ] Architecture doc build diagrams include setup script step
- [ ] API reference page created with all types, all 6 examples, and "How it works"
- [ ] No broken Markdown links or formatting
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
