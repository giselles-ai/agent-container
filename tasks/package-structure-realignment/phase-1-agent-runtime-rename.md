# Phase 1: Rename `sandbox-agent` to `agent-runtime`

> **GitHub Issue:** #TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 0
> **Parallel with:** Phase 2, Phase 3
> **Blocks:** Phase 4

## Objective

`packages/sandbox-agent` の名前を責務ベースに揃える。実装内容は “agent を sandbox 上で動かす runtime primitives” なので、directory と package name を `agent-runtime` に rename し、active surface から古い名前を外す。

## What You're Building

```mermaid
flowchart LR
    Old["packages/sandbox-agent"]
    New["packages/agent-runtime"]
    Docs["README / taxonomy docs"]

    Old --> New
    New --> Docs

    style Old fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style New fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Docs fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Deliverables

### 1. `packages/agent-runtime/` directory

Move `packages/sandbox-agent/` to `packages/agent-runtime/` with history preserved.

Use a non-interactive move:

```bash
git mv packages/sandbox-agent packages/agent-runtime
```

### 2. `packages/agent-runtime/package.json`

Update the package identity and repository directory:

```json
{
  "name": "@giselles-ai/agent-runtime",
  "repository": {
    "directory": "packages/agent-runtime"
  }
}
```

Keep the existing exports and scripts unchanged unless the path move itself requires adjustments.

### 3. Source and test imports inside the package

After the directory move, confirm all internal relative imports still resolve. The package currently uses relative imports like:

```ts
import type { ChatAgent } from "../chat-run";
import { createCodexStdoutMapper } from "./codex-mapper";
```

These should require no change after the move, but the package build must confirm that assumption.

### 4. Active docs

Update only active docs and examples that present the current package map:

- `README.md`
- `docs/package-taxonomy.md`

Historical documents may keep the old name if they are explicitly marked historical.

## Verification

1. **Package checks**
   ```bash
   pnpm --filter @giselles-ai/agent-runtime typecheck
   pnpm --filter @giselles-ai/agent-runtime test
   pnpm --filter @giselles-ai/agent-runtime build
   ```

2. **Reference checks**
   ```bash
   rg -n "@giselles-ai/sandbox-agent|packages/sandbox-agent" apps packages scripts README.md docs
   ```
   Active code/docs should not reference the old name after this phase, except explicitly historical docs.

3. **Manual review**
   1. Open `packages/agent-runtime/package.json`.
   2. Confirm the package name is `@giselles-ai/agent-runtime`.
   3. Confirm `repository.directory` matches the new path.

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/sandbox-agent/` | **Move** to `packages/agent-runtime/` |
| `packages/agent-runtime/package.json` | **Modify** (name and repository path) |
| `README.md` | **Modify** (rename active package references) |
| `docs/package-taxonomy.md` | **Modify** (finalized rename map) |

## Done Criteria

- [ ] `packages/agent-runtime/` exists and builds successfully
- [ ] `@giselles-ai/agent-runtime` is the package name in `package.json`
- [ ] No active import/docs reference `@giselles-ai/sandbox-agent`
- [ ] Historical docs, if left unchanged, are clearly marked historical
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
