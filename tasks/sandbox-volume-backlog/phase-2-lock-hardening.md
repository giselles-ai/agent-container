# Phase 2: Lock Hardening

> **GitHub Issue:** TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** None
> **Parallel with:** Phase 0, Phase 1, Phase 3
> **Blocks:** Phase 4

## Objective

Tighten lock semantics so the package has a clearer production story around conflicts and stale leases.

## Deliverables

1. Clarify lock error types and expected adapter behavior.
2. Add tests for conflict/stale/release-failure paths.
3. Document operational expectations.

## Verification

```bash
pnpm -F sandbox-volume test
pnpm -F sandbox-volume typecheck
```

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/sandbox-volume/src/transaction.ts` | **Modify** |
| `packages/sandbox-volume/src/__tests__/mount.test.ts` | **Modify** |
| `packages/sandbox-volume/README.md` | **Modify** |

## Done Criteria

- [ ] Conflict paths are explicit and tested
- [ ] Lock behavior is documented, not implied
- [ ] All checks pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
