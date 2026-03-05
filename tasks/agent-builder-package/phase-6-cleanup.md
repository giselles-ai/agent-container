# Phase 6: Cleanup

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 5 (giselle-provider decoupled)
> **Blocks:** None

## Objective

Remove `@vercel/sandbox` and `@giselles-ai/sandbox-agent` dependencies from the `packages/web` package. Clean up any remaining references. After this phase, agent-container's web package has zero direct Vercel Sandbox dependency.

## What You're Building

This phase is purely subtractive — no new code, only removals.

## Deliverables

### 1. `packages/web/package.json` — MODIFY

Remove these dependencies:

```diff
  "dependencies": {
-   "@giselles-ai/sandbox-agent": "workspace:*",
-   "@vercel/sandbox": "1.4.1",
    "@ai-sdk/react": "3.0.70",
    "@giselles-ai/agent-builder": "workspace:*",
    "@giselles-ai/browser-tool": "workspace:*",
    "@giselles-ai/giselle-provider": "workspace:*",
    ...
  }
```

### 2. Remove remaining imports

Search `packages/web/` for any remaining imports from `@giselles-ai/sandbox-agent` or `@vercel/sandbox`:

```bash
grep -r "@giselles-ai/sandbox-agent\|@vercel/sandbox" packages/web/app/ packages/web/lib/
```

Remove any found imports. After Phase 4, `route.ts` should already be clean, but verify other files (e.g., demo pages, other API routes).

### 3. Remove `route.ts` dead code

Verify that these functions were removed in Phase 4. If any remain, delete them now:

- `resolveAgentType`
- `resolveAgentSnapshotId`
- `resolveAgent`
- `asRecord` (only if not used elsewhere in `route.ts`)
- `asNonEmptyString` (only if not used elsewhere in `route.ts`)

Read `route.ts` carefully — `asRecord` and `asNonEmptyString` are also used by `parseChatRequestBody`, `resolveSessionId`, and `mergeProviderOptions`, so they likely need to stay.

### 4. Remove `as any` from Phase 4

If a temporary `as any` type assertion was added in Phase 4 for the `agent` parameter, remove it now that `giselle-provider` accepts `AgentRef`:

```ts
// Remove this:
model: giselle({ agent: agent as any, ... })

// Replace with:
model: giselle({ agent, ... })
```

Verify the type is compatible: `DefinedAgent` (from `defineAgent`) should satisfy `AgentRef` (from `giselle-provider`).

### 5. Run `pnpm install`

After removing dependencies, run:

```bash
pnpm install
```

This updates `pnpm-lock.yaml`.

## Verification

1. **No sandbox imports in web:**
   ```bash
   grep -r "@vercel/sandbox\|@giselles-ai/sandbox-agent" packages/web/
   ```
   Should return no results (except possibly `node_modules/`).

2. **Build:**
   ```bash
   cd packages/web && pnpm build
   ```

3. **Typecheck:**
   ```bash
   cd packages/web && pnpm typecheck
   ```

4. **Monorepo build:**
   ```bash
   pnpm -r build
   ```

5. **Monorepo typecheck:**
   ```bash
   pnpm -r typecheck
   ```

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/web/package.json` | **Modify** (remove sandbox deps) |
| `packages/web/app/api/chat/route.ts` | **Modify** (remove `as any` if present) |
| `pnpm-lock.yaml` | **Auto-updated** by `pnpm install` |

## Done Criteria

- [ ] `@vercel/sandbox` not in `packages/web/package.json`
- [ ] `@giselles-ai/sandbox-agent` not in `packages/web/package.json`
- [ ] No imports from either package in `packages/web/app/` or `packages/web/lib/`
- [ ] No `as any` type assertions for the agent parameter
- [ ] `pnpm -r build` passes
- [ ] `pnpm -r typecheck` passes
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
