# Phase 2: Rename `sandbox-agent-kit` to `agent-snapshot-kit`

> **GitHub Issue:** #TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 0
> **Parallel with:** Phase 1, Phase 3
> **Blocks:** Phase 4

## Objective

snapshot build tooling を “agent snapshot kit” として揃える。package directory・package name・CLI usage text・active docs・workspace metadata を更新して、browser-tool 向け snapshot builder であることを現在の repo state と一致させる。

## What You're Building

```mermaid
flowchart LR
    Old["packages/sandbox-agent-kit"]
    New["packages/agent-snapshot-kit"]
    Cli["CLI name / usage text"]

    Old --> New
    New --> Cli

    style Old fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style New fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Cli fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Deliverables

### 1. `packages/agent-snapshot-kit/` directory

Move the package directory with history preserved:

```bash
git mv packages/sandbox-agent-kit packages/agent-snapshot-kit
```

### 2. `packages/agent-snapshot-kit/package.json`

Update the package identity:

```json
{
  "name": "@giselles-ai/agent-snapshot-kit",
  "bin": {
    "agent-snapshot-kit": "./dist/cli.js"
  },
  "repository": {
    "directory": "packages/agent-snapshot-kit"
  }
}
```

Do not change the library export surface in this phase. Keep:

```ts
export type { BuildSnapshotOptions } from "./build-snapshot";
export { buildSnapshot } from "./build-snapshot";
```

### 3. `packages/agent-snapshot-kit/src/cli.ts` and `packages/agent-snapshot-kit/AGENTS.md`

Update package-local naming and usage strings:

```ts
const usage = `Usage:
  agent-snapshot-kit build-snapshot [options]
`;
```

Update package docs so they point at the new directory:

```md
# agent-snapshot-kit

cd packages/agent-snapshot-kit
pnpm dev build-snapshot --local --repo-root ../..
```

### 4. Active docs and workspace metadata

Update active docs so the rename is presented as complete rather than future work:

- `README.md`
- `docs/package-taxonomy.md`

Refresh workspace metadata from the repo root:

```bash
pnpm install
```

`pnpm-workspace.yaml` does not need changes in this phase because `packages/*` already includes the renamed package directory.

## Verification

1. **Workspace metadata refresh**
   ```bash
   pnpm install
   ```

2. **Package checks**
   ```bash
   pnpm --filter @giselles-ai/agent-snapshot-kit typecheck
   pnpm --filter @giselles-ai/agent-snapshot-kit build
   ```

3. **Reference checks**
   ```bash
   rg -n "sandbox-agent-kit|@giselles-ai/sandbox-agent-kit" packages README.md docs pnpm-lock.yaml scripts apps
   ```
   Old names should not remain in active files after this phase.

4. **Static CLI naming check**
   1. Open `packages/agent-snapshot-kit/src/cli.ts`.
   2. Confirm the usage text prints `agent-snapshot-kit build-snapshot`.
   3. Open `packages/agent-snapshot-kit/AGENTS.md` and confirm the local dev command uses `packages/agent-snapshot-kit`.

   Do not require `node packages/agent-snapshot-kit/dist/cli.js --help` in this phase. The built CLI currently has a duplicated shebang and that packaging defect is outside the rename scope.

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/sandbox-agent-kit/` | **Move** to `packages/agent-snapshot-kit/` |
| `packages/agent-snapshot-kit/package.json` | **Modify** (name, bin, repository path) |
| `packages/agent-snapshot-kit/src/cli.ts` | **Modify** (usage text) |
| `packages/agent-snapshot-kit/AGENTS.md` | **Modify** (package title and examples) |
| `README.md` | **Modify** (rename is complete, not future target) |
| `docs/package-taxonomy.md` | **Modify** (active inventory uses the new path/name only) |
| `pnpm-lock.yaml` | **Modify** (workspace importer key updates after `pnpm install`) |

## Done Criteria

- [ ] `packages/agent-snapshot-kit/` exists and builds successfully
- [ ] Package name is `@giselles-ai/agent-snapshot-kit`
- [ ] CLI help uses `agent-snapshot-kit`
- [ ] No active files reference `sandbox-agent-kit`
- [ ] `pnpm-workspace.yaml` remains unchanged because `packages/*` already covers the renamed directory
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
