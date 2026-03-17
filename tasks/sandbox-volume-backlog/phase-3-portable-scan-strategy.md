# Phase 3: Portable Scan Strategy

> **GitHub Issue:** TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** None
> **Parallel with:** Phase 0, Phase 1, Phase 2
> **Blocks:** Phase 4

## Objective

Reduce dependence on `bash` + `find` so scanning is easier to reason about across environments.

## Deliverables

1. Add a more explicit scan strategy abstraction or fallback path.
2. Add tests for the new scan logic.
3. Document environment assumptions if any remain.

## Verification

```bash
pnpm -F sandbox-volume test
pnpm -F sandbox-volume typecheck
pnpm -F sandbox-volume build
```

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/sandbox-volume/src/sandbox-files.ts` | **Modify** |
| `packages/sandbox-volume/src/__tests__/transaction-commit.test.ts` | **Modify** |
| `packages/sandbox-volume/README.md` | **Modify** |

## Done Criteria

- [ ] Scan strategy is less shell-fragile
- [ ] Remaining assumptions are documented
- [ ] All checks pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
