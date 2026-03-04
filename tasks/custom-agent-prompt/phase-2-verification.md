# Phase 2: Verification & Polish

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1 (route handler + spreadsheet demo wired up)
> **Blocks:** None

## Objective

Validate end-to-end that `agent.setAgentMd()` injection works in the spreadsheet demo and tune `SPREADSHEET_AGENT_PROMPT` only if required by observed behavior.

## Scope

- No architecture changes.
- No public API, schema, or type changes.
- No code changes except optional prompt-tuning edit in:
  - `packages/web/app/demo/spreadsheet/page.tsx`
- All verification should remain in this phase file and AGENTS status updates.

## Preconditions

Run in this order before behavioral checks:

1. Start the app:
   - `pnpm dev`
2. Open these URLs:
   - `http://localhost:3000/demo/spreadsheet`
   - `http://localhost:3000/codex-browser-tool`
3. Ensure required environment variables exist where the server reads them:
   - `SANDBOX_SNAPSHOT_ID`
   - `AGENT_TYPE`
   - `EXTERNAL_AGENT_API_BEARER_TOKEN`
   - optional `EXTERNAL_AGENT_API_PROTECTION_BYPASS` if your environment requires it

## 1. End-to-end test scenarios

Run scenarios 1–4 on `/demo/spreadsheet`, then run scenario 5 on `/codex-browser-tool`.

| # | User Input | Expected behavior |
|---|---|---|
| 1 | Click the suggested prompt `"npm download trends"` and send | Tool call sequence includes `getFormSnapshot` first, then spreadsheet fills with `zod`, `yup`, `joi` headers and download-like numeric values in rows |
| 2 | Type `"React, Vue, Svelte のGitHub star数を比較して"` and send | Grid is populated with a structured comparison, not explanation-only output |
| 3 | Type `"日本の人口上位5都市を教えて"` and send | Five rows of city/population-like values are filled in spreadsheet cells |
| 4 | Send a follow-up message in the same chat session | The agent continues from previous state (no prompt loss), and can modify/append based on prior output |
| 5 | Send a normal request in `/codex-browser-tool` (no `agent.prompt`) | Existing non-prompt behavior remains unchanged |

### Signal of pass/fail

- Pass requires actual tool activity and filled cells (or visible tool calls) rather than text-only responses.
- Failure includes: wrong headers/rows, no tool calls, explain-only behavior, missing follow-up context, or regression in the non-prompt demo.

## 2. Prompt tuning workflow (only if needed)

If any scenario fails, update only:

- [`packages/web/app/demo/spreadsheet/page.tsx`](../../packages/web/app/demo/spreadsheet/page.tsx)

`SPREADSHEET_AGENT_PROMPT`:

1. If sequence is wrong:
   - add `Always call getFormSnapshot before any executeFormActions.`
2. If mapping is wrong:
   - add an explicit header-first example.
3. If the agent only describes actions:
   - add `Do not explain; perform tool calls immediately.`
4. If data availability is inconsistent:
   - add `Research data first, then fill; if unavailable use "N/A".`

Rerun scenarios 1–4 after any text-only prompt edits.

## 3. Performance note

`setAgentMd()` intentionally marks the agent dirty and triggers `prepare()` each request, which creates a fresh snapshot. This is acceptable now. If latency becomes a concern, cache by prompt content hash in a future phase (do not implement now).

## Verification

1. Complete all 5 scenarios successfully.
2. Unit and build checks:
   ```bash
   pnpm --filter @giselles-ai/sandbox-agent test
   pnpm --filter @giselles-ai/sandbox-agent build
   pnpm --filter demo typecheck
   pnpm --filter demo build
   ```
3. Formatting/lint check:
   ```bash
   pnpm format
   ```
   (or repository equivalent if format is scoped differently)

## Files to Create/Modify

| File | Action |
|---|---|
| `tasks/custom-agent-prompt/phase-2-verification.md` | **Modify** — apply this final verification plan |
| `tasks/custom-agent-prompt/AGENTS.md` | **Modify** — update phase status to `✅ DONE` |
| `packages/web/app/demo/spreadsheet/page.tsx` | **Modify** only if prompt tuning is needed |

## Done Criteria

- [ ] All 5 scenarios in section 1 pass
- [ ] No regressions in non-prompt agent requests
- [ ] If scenario fails, prompt tuning is applied in `page.tsx` and scenarios 1–4 are re-run
- [ ] Verification commands in section 2 pass
- [ ] Update status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
