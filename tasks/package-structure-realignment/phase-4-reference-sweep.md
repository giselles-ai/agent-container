# Phase 4: Reference Sweep & Verification

> **GitHub Issue:** #TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1, Phase 2, Phase 3
> **Parallel with:** None
> **Blocks:** None

## Objective

rename と boundary cleanup のあとに、active surface に旧 package identifier や古い説明が残らない状態を作る。deprecated な `root/sandbox-agent/` workspace はこの phase でも対象外のままにしつつ、historical docs の注記だけを現在の repo state に合わせて補正し、renamed packages の build / typecheck / test を通す。

## What You're Building

```mermaid
flowchart LR
    Renames["New package names"]
    Search["Reference sweep"]
    Verify["build / typecheck verification"]

    Renames --> Search
    Search --> Verify

    style Renames fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Search fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Verify fill:#1a1a2e,stroke:#e94560,color:#ffffff
```

## Deliverables

### 1. Exact legacy package identifier sweep

Search and update active references across:

- `apps/`
- `packages/`
- `scripts/`
- `README.md`
- `docs/`

Use exact legacy package identifiers only:

```bash
rg -n "@giselles-ai/sandbox-agent|@giselles-ai/sandbox-agent-kit|packages/sandbox-agent\b|packages/sandbox-agent-kit\b" apps packages scripts README.md docs
```

Do not search bare `sandbox-agent`, because that would overmatch the intentionally deprecated `root/sandbox-agent/` workspace and create false positives.

After Phase 1–3, this sweep should be empty. If it returns anything, update only the active or historical note that still claims the old package name/path is current.

### 2. Historical note correction

Update the stale note at the top of `docs/cloud-service-implementation-plan.md` so it says the current repo uses `@giselles-ai/agent-runtime` at `packages/agent-runtime`.

Keep the rest of the document historical. It is still allowed to describe older design ideas, but the introductory note must not claim that `@giselles-ai/sandbox-agent` / `packages/sandbox-agent` are the current names.

### 3. Canonical rename-policy docs stay intentional

Do not treat these as sweep failures:

- `docs/package-taxonomy.md` mentioning `sandbox-agent` in the rename map
- `README.md` mentioning deprecated `root/sandbox-agent/`
- root-level legacy references such as `package.json` pointing to `sandbox-agent/scripts/release-cli.mjs`
- `pnpm-workspace.yaml` including `sandbox-agent/*`

This phase does not remove or migrate deprecated root workspace material.

### 4. Monorepo verification

Run the package-level checks first:

```bash
pnpm --filter @giselles-ai/agent-runtime typecheck
pnpm --filter @giselles-ai/agent-runtime test
pnpm --filter @giselles-ai/agent-runtime build
pnpm --filter @giselles-ai/agent-kit typecheck
pnpm --filter @giselles-ai/agent-kit build
pnpm --filter @giselles-ai/browser-tool typecheck
pnpm --filter @giselles-ai/browser-tool build
pnpm --filter @giselles-ai/agent-builder build
pnpm --filter @giselles-ai/giselle-provider build
```

Then run the workspace-level checks:

```bash
pnpm typecheck
pnpm build
```

`pnpm typecheck` should pass. Attempt `pnpm build`, but do not expand this phase if the remaining failure is a known non-rename blocker such as:

- `turbo` 2.8.7 panicking on macOS (`Attempted to create a NULL object`)
- `apps/demo` failing to fetch Google Fonts in a network-restricted environment

If `pnpm build` fails only for those reasons, document the blocker and still treat the rename/reference sweep as complete.

## Verification

1. **Search checks**
   ```bash
   rg -n "@giselles-ai/sandbox-agent|@giselles-ai/sandbox-agent-kit|packages/sandbox-agent\b|packages/sandbox-agent-kit\b" apps packages scripts README.md docs
   ```
   This should return nothing.

2. **Automated checks**
   ```bash
   pnpm --filter @giselles-ai/agent-runtime typecheck
   pnpm --filter @giselles-ai/agent-runtime test
   pnpm --filter @giselles-ai/agent-runtime build
pnpm --filter @giselles-ai/agent-kit typecheck
pnpm --filter @giselles-ai/agent-kit build
   pnpm --filter @giselles-ai/browser-tool typecheck
   pnpm --filter @giselles-ai/browser-tool build
   pnpm --filter @giselles-ai/agent-builder build
   pnpm --filter @giselles-ai/giselle-provider build
   pnpm typecheck
   pnpm build
   ```

3. **Manual review**
   1. Open `docs/cloud-service-implementation-plan.md` and confirm it no longer claims `@giselles-ai/sandbox-agent` / `packages/sandbox-agent` are current.
   2. Open the README package section and confirm all listed package names match the actual directories under `packages/`.
   3. Confirm only intentional deprecated-root references to `root/sandbox-agent/` remain.

## Files to Create/Modify

| File | Action |
|---|---|
| `docs/cloud-service-implementation-plan.md` | **Modify** (historical note uses current package name/path) |
| `README.md` | **Modify if needed** (only if exact legacy package identifiers remain) |
| `docs/package-taxonomy.md` | **Leave unchanged unless it accidentally claims old names are current** |
| `tasks/package-structure-realignment/AGENTS.md` | **Modify** (mark completed phases) |

## Done Criteria

- [ ] Exact legacy package identifiers are gone from `apps/`, `packages/`, `scripts/`, `README.md`, and `docs/`
- [ ] `docs/cloud-service-implementation-plan.md` states the current package/path as `@giselles-ai/agent-runtime` at `packages/agent-runtime`
- [ ] Package-level checks pass for renamed packages
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` is attempted; any remaining failure is a documented non-rename blocker rather than unresolved rename fallout
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
