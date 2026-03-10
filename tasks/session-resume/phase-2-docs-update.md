# Phase 2: Update Architecture Documentation

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1
> **Parallel with:** None

## Objective

Update `docs/03-architecture/03-01-architecture.md` to reflect the new `snapshotId` persistence in the store and the sandbox expire recovery flow.

## Deliverables

### 1. `docs/03-architecture/03-01-architecture.md` — Two sections to update

#### A. "Layer 4: Session State" table (around L220)

Add `Snapshot ID` row to the state table:

**Before:**
```markdown
| State | Stored In | Purpose |
|---|---|---|
| Sandbox ID | Redis | Resume the same VM across turns |
| Agent session ID | Redis | Continue the CLI agent's session (Gemini's `--session_id`) |
| Relay session | Redis | Maintain the SSE connection for browser tools |
| Pending tool state | Redis | Track in-progress tool calls across request boundaries |
| Chat history | AI SDK (client) | Message history managed by `useChat` |
```

**After:**
```markdown
| State | Stored In | Purpose |
|---|---|---|
| Sandbox ID | Redis | Resume the same VM across turns |
| Snapshot ID | Redis | Recreate the sandbox if it has expired |
| Agent session ID | Redis | Continue the CLI agent's session (Gemini's `--session_id`) |
| Relay session | Redis | Maintain the SSE connection for browser tools |
| Pending tool state | Redis | Track in-progress tool calls across request boundaries |
| Chat history | AI SDK (client) | Message history managed by `useChat` |
```

#### B. State flow description (around L228-231)

Add a note about sandbox expiration recovery after the existing pause/resume description.

**Add after the existing paragraph ("When a browser tool request arrives..."):**

```markdown
Sandbox expiration is handled transparently. After each agent turn, a new snapshot is captured and its ID is persisted to the store alongside the sandbox ID. If a sandbox has expired when the next turn begins, the system recreates it from the last snapshot — preserving the agent's filesystem state while obtaining a fresh VM. This means applications only need to track a `sessionId` (the chat ID); the store handles all infrastructure state recovery automatically.
```

## Verification

1. Read the updated file and confirm the table has 6 rows (not 5)
2. Confirm the new paragraph fits naturally after the existing pause/resume description
3. No broken markdown formatting

## Files to Create/Modify

| File | Action |
|---|---|
| `docs/03-architecture/03-01-architecture.md` | **Modify** — add Snapshot ID row to table, add recovery description |

## Done Criteria

- [ ] Session State table includes "Snapshot ID" row
- [ ] Recovery flow is described in prose
- [ ] Markdown renders correctly
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
