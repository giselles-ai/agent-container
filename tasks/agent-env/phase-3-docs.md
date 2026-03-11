# Phase 3: Docs

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1, Phase 2

## Objective

Update all documentation to reflect the new `env` field in `defineAgent()`. Add usage examples, update API reference tables, and mention env in the architecture docs.

## Deliverables

### 1. `docs/02-api-reference/02-01-define-agent.md`

**Add `env` to the `AgentConfig` table:**

| Property | Type | Default | Description |
|---|---|---|---|
| `env` | `Record<string, string>` | `{}` | Environment variables passed to the sandbox at build time (setup script) and run time (CLI execution). Never baked into snapshots. |

**Add `env` to the `DefinedAgent` table:**

| Property | Type | Description |
|---|---|---|
| `env` | `Record<string, string>` | The resolved environment variables. Empty object when not configured. |

**Add a new example section** after the existing "Files + setup combined" example:

```markdown
### With environment variables

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: "You are a helpful assistant with access to GitHub.",
  env: {
    GITHUB_AUTH_TOKEN: process.env.GITHUB_AUTH_TOKEN!,
    MY_CUSTOM_VAR: "hello",
  },
});
\```

### Environment variables + setup script

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: "You are a project contributor.",
  env: {
    GITHUB_AUTH_TOKEN: process.env.GITHUB_AUTH_TOKEN!,
    NPM_TOKEN: process.env.NPM_TOKEN!,
  },
  setup: {
    script: `
git clone https://github.com/owner/private-repo.git ~/project
cd ~/project && npm install
    `,
  },
});
\```
```

### 2. `docs/01-getting-started/01-01-getting-started.md`

**In the "Customizing the sandbox environment" section** (after the `setup.script` explanation, around line 87), add a paragraph about env:

```markdown
### Passing environment variables

Use `env` to pass environment variables to the sandbox. These are available both during the setup script and when the agent runs:

\```ts
export const agent = defineAgent({
  agentType: "gemini",
  agentMd: "You are a helpful assistant.",
  env: {
    GITHUB_AUTH_TOKEN: process.env.GITHUB_AUTH_TOKEN!,
  },
  setup: {
    script: `
git clone https://github.com/owner/private-repo.git ~/project
    `,
  },
});
\```

Environment variables are passed securely to each command execution — they are never stored in the sandbox snapshot.
```

### 3. `docs/03-architecture/03-01-architecture.md`

**In "The Build Pipeline" section** (around line 322), update the content hash description to include `env`:

Current text:
> The content hash is computed from `agentType`, `agentMd`, `files`, and `setup.script` — so the snapshot is only rebuilt when your agent definition actually changes.

Updated text:
> The content hash is computed from `agentType`, `agentMd`, `files`, `setup.script`, and `env` — so the snapshot is only rebuilt when your agent definition actually changes.

**In the build pipeline ASCII diagram** (around line 114-120), add a line for env:

```
  ├─ Write AGENTS.md + user files      ◀─ From defineAgent({ agentMd, files })
  │
  ├─ Run setup script                  ◀─ From defineAgent({ setup: { script } })
  │  e.g. npx opensrc vercel/ai        ◀─ env vars from defineAgent({ env }) passed
  │       npm install -g tsx               to runCommand, not baked into snapshot
```

## Verification

1. Review each doc file manually to ensure:
   - Tables are properly formatted
   - Code examples are syntactically valid
   - No broken links
   - Consistent style with existing docs

2. No build or test commands needed for docs-only changes.

## Files to Create/Modify

| File | Action |
|---|---|
| `docs/02-api-reference/02-01-define-agent.md` | **Modify** — add `env` to type tables, add examples |
| `docs/01-getting-started/01-01-getting-started.md` | **Modify** — add env section |
| `docs/03-architecture/03-01-architecture.md` | **Modify** — update hash description and build diagram |

## Done Criteria

- [ ] `defineAgent` API reference includes `env` in both `AgentConfig` and `DefinedAgent` tables
- [ ] API reference has usage examples for env
- [ ] Getting started guide has a section on environment variables
- [ ] Architecture doc mentions `env` in content hash and build pipeline
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
