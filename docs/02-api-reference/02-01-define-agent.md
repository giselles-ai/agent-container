# `defineAgent`

Creates an agent definition that configures a CLI agent running inside a cloud sandbox.

## Import

```ts
import { defineAgent } from "@giselles-ai/agent";
```

## Signature

```ts
function defineAgent(config: AgentConfig): DefinedAgent
```

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

```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: "You are a helpful assistant.",
});
```

### With reference documentation

```ts
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
```

### With pre-installed tools

```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: "You can run TypeScript files using tsx.",
  setup: {
    script: `npm install -g tsx`,
  },
});
```

### With a cloned repository

```ts
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
```

### Complex setup with full shell features

```ts
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
```

### Files + setup combined

```ts
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
```
