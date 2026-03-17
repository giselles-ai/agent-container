# Phase 4: Docs + Integration

> **GitHub Issue:** TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 0, Phase 1, Phase 2, Phase 3
> **Parallel with:** None
> **Blocks:** None

## Objective

Close the loop with integration coverage and docs once the remaining features are in place.

## Deliverables

1. Update README with the real storage/locking/rewrite story.
2. Add or extend integration tests across the new features.
3. Verify the package can be used through its public exports only.

## Verification

```bash
pnpm -F sandbox-volume format
pnpm -F sandbox-volume test
pnpm -F sandbox-volume typecheck
pnpm -F sandbox-volume build
```

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/sandbox-volume/README.md` | **Modify** |
| `packages/sandbox-volume/src/__tests__/integration.test.ts` | **Modify** |
| `packages/sandbox-volume/src/index.ts` | **Modify** |

## Done Criteria

- [ ] Docs match shipped behavior
- [ ] Public-entry integration path is covered
- [ ] All checks pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
