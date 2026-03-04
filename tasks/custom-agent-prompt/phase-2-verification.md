# Phase 2: Verification & Polish

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1 (route handler + spreadsheet demo wired up)
> **Blocks:** None

## Objective

End-to-end verification that the `setAgentMd()` → AGENTS.md injection flow works correctly. Tune the system prompt based on actual agent behavior.

## Deliverables

### 1. End-to-end test scenarios

Run the following scenarios on the spreadsheet demo page:

| # | User Input | Expected Behavior |
|---|---|---|
| 1 | Click "npm download trends" suggested prompt | Agent calls `getFormSnapshot`, fills headers with "zod", "yup", "joi" and rows with download data |
| 2 | Type "React, Vue, Svelte のGitHub star数を比較して" | Agent infers 3 columns, fills headers + star counts |
| 3 | Type "日本の人口上位5都市を教えて" | Agent fills 5 rows with city names and population data |
| 4 | Send a follow-up message in the same session | Session resume still works correctly |
| 5 | Request **without** prompt in providerOptions (different demo) | Agent works as before — no AGENTS.md injected, no regression |

### 2. Prompt tuning (if needed)

Based on test results, adjust `SPREADSHEET_AGENT_PROMPT` in `page.tsx`:

- If the agent doesn't call `getFormSnapshot` first → make the instruction more explicit
- If column/row mapping is wrong → add examples to the prompt
- If the agent describes what it would do instead of acting → strengthen "Always fill the form" instruction

### 3. Performance note

`setAgentMd()` makes the agent dirty, which triggers `prepare()` → snapshot creation on every request. This is expected and acceptable. If latency becomes a concern in the future, consider caching by prompt hash — **do not implement now**.

## Verification

1. **All 5 test scenarios pass** as described above.
2. **Unit tests:**
   ```bash
   pnpm vitest run --filter=sandbox-agent
   ```
3. **TypeScript build:**
   ```bash
   pnpm turbo build --filter=@giselles-ai/web
   ```
4. **Biome lint:**
   ```bash
   pnpm biome check packages/web/app/demo/spreadsheet/page.tsx packages/web/app/api/chat/route.ts
   ```

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/web/app/demo/spreadsheet/page.tsx` | **Modify** (only if prompt tuning is needed) |

## Done Criteria

- [ ] All 5 test scenarios produce correct results
- [ ] No regressions in non-prompt agent requests
- [ ] All tests, build, and lint pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
