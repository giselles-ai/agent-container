# Phase 4: Reference Sweep & Verification

> **GitHub Issue:** #TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1, Phase 2, Phase 3
> **Parallel with:** None
> **Blocks:** None

## Objective

rename と boundary cleanup のあとに、active surface に旧 package 名や古い説明が残らない状態を作る。ここでは historical docs を壊さず、active code / package docs / scripts だけを sweep して build と typecheck を通す。

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

### 1. Active reference sweep

Search and update active references across:

- `apps/`
- `packages/`
- `scripts/`
- `README.md`
- `docs/package-taxonomy.md`

Recommended searches:

```bash
rg -n "@giselles-ai/sandbox-agent|packages/sandbox-agent" apps packages scripts README.md docs/package-taxonomy.md
rg -n "@giselles-ai/sandbox-agent-kit|sandbox-agent-kit" apps packages scripts README.md docs/package-taxonomy.md
```

If old names remain in historical docs under `docs/`, add a clear note such as:

```md
> Historical note: this document uses the former package name `@giselles-ai/sandbox-agent`.
```

### 2. Root scripts and docs sanity

Check whether any root-level script or doc still points at renamed package paths. If so, update them to the new directory names.

Typical examples:

```json
{
  "scripts": {
    "snapshot:browser-tool": "node scripts/create-browser-tool-snapshot.mjs"
  }
}
```

The script names can remain stable if their implementation paths do not need renaming.

### 3. Monorepo verification

Run the package-level checks first:

```bash
pnpm --filter @giselles-ai/agent-runtime build
pnpm --filter @giselles-ai/agent-runtime test
pnpm --filter @giselles-ai/agent-runtime typecheck
pnpm --filter @giselles-ai/agent-snapshot-kit build
pnpm --filter @giselles-ai/agent-snapshot-kit typecheck
pnpm --filter @giselles-ai/browser-tool build
pnpm --filter @giselles-ai/browser-tool typecheck
pnpm --filter @giselles-ai/agent-builder build
pnpm --filter @giselles-ai/giselle-provider build
```

Then run a workspace-level check:

```bash
pnpm typecheck
pnpm build
```

If the deprecated `root/sandbox-agent/` workspace breaks these commands and has not yet been removed from the workspace config, document that as a follow-up instead of pulling it into this epic.

## Verification

1. **Search checks**
   ```bash
   rg -n "@giselles-ai/sandbox-agent|@giselles-ai/sandbox-agent-kit|sandbox-agent-kit|packages/sandbox-agent" apps packages scripts README.md docs/package-taxonomy.md
   ```
   This should return nothing in active files.

2. **Automated checks**
   ```bash
   pnpm typecheck
   pnpm build
   ```

3. **Manual review**
   1. Open the README package section.
   2. Confirm all listed package names match the actual directories under `packages/`.
   3. Confirm no historical / deprecated name appears without explanation.

## Files to Create/Modify

| File | Action |
|---|---|
| `README.md` | **Modify if needed** (final naming sweep) |
| `docs/package-taxonomy.md` | **Modify if needed** |
| `package.json` | **Modify if root scripts need path updates** |
| `scripts/*` | **Modify if old package paths remain** |
| `tasks/package-structure-realignment/AGENTS.md` | **Modify** (mark completed phases) |

## Done Criteria

- [ ] Old `sandbox-agent` names are gone from active files
- [ ] Old `sandbox-agent-kit` names are gone from active files
- [ ] Package-level checks pass for renamed packages
- [ ] Workspace `pnpm typecheck` and `pnpm build` pass, or any remaining blocker is explicitly documented as out-of-scope deprecated workspace fallout
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
