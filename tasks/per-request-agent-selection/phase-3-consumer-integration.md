# Phase 3: Consumer Integration & Docs

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 2 (Cloud API agent resolution must be complete)

## Objective

Wire up the `agent` option in the consumer app (`packages/web`) and update documentation so developers know how to use per-request agent selection. After this phase, the `packages/web/app/api/chat/route.ts` demonstrates how to pass agent config through `giselle()`.

## What You're Building

```mermaid
flowchart LR
    Consumer["packages/web route.ts"] -->|giselle({ agent })| Provider["GiselleAgentModel"]
    Provider -->|POST {agent_type, snapshot_id}| Cloud["Cloud API"]
    Cloud -->|readAgentMetadata| Sandbox["Sandbox"]

    style Consumer fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Provider fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Cloud fill:#1a1a2e,stroke:#e94560,color:#ffffff
```

## Deliverables

### 1. `packages/web/app/api/chat/route.ts` — Add agent config support

Read `packages/web/app/api/chat/route.ts` first to understand the current flow.

The consumer route should read agent config from environment or request and pass it to `giselle()`:

```typescript
function resolveAgentConfig(): { type?: "gemini" | "codex"; snapshotId?: string } | undefined {
	const agentType = process.env.AGENT_TYPE?.trim().toLowerCase();
	const snapshotId = process.env.SANDBOX_SNAPSHOT_ID?.trim();

	if (!agentType && !snapshotId) {
		return undefined;
	}

	return {
		type: agentType === "codex" ? "codex" : agentType === "gemini" ? "gemini" : undefined,
		snapshotId: snapshotId || undefined,
	};
}

// In POST handler:
const result = streamText({
    model: giselle({
        cloudApiUrl: CLOUD_API_URL,
        headers: buildCloudApiHeaders(),
        agent: resolveAgentConfig(),  // ← NEW
    }),
    messages: await convertToModelMessages(messages),
    tools,
    providerOptions,
    abortSignal: request.signal,
});
```

This is a minimal change — the consumer reads from env vars and passes them through. In a future iteration, the agent config could come from user preferences, a database, or the request itself.

### 2. `README.md` — Update documentation

Add a section documenting per-request agent selection. Update the existing "Environment Variables" and "Usage" sections.

#### Add to Usage section (after the existing Route Handler example):

```markdown
### Agent Selection

By default, the system uses the Gemini CLI backend. To use a different agent, pass the `agent` option to `giselle()`:

\```typescript
// Use Codex CLI backend
const result = streamText({
  model: giselle({
    cloudApiUrl: "https://studio.giselles.ai",
    headers: { authorization: "Bearer ..." },
    agent: { type: "codex" },
  }),
  // ...
});

// Use a custom snapshot (agent type auto-detected from snapshot metadata)
const result = streamText({
  model: giselle({
    cloudApiUrl: "https://studio.giselles.ai",
    headers: { authorization: "Bearer ..." },
    agent: { snapshotId: "snap_custom_research_agent" },
  }),
  // ...
});
\```

Agent type is resolved in this priority order:
1. Snapshot metadata (`/.agent-metadata.json` baked into the snapshot)
2. Explicit `agent.type` passed to `giselle()`
3. `AGENT_TYPE` environment variable (deployment default)
```

#### Update the `@giselles-ai/giselle-provider` package table:

Add `GiselleAgentConfig` to the exports table:

```markdown
| `GiselleAgentConfig` | Agent selection config (`type`, `snapshotId`) |
```

#### Update the `@giselles-ai/sandbox-agent` package table:

Add metadata exports:

```markdown
| `readAgentMetadata()` | Read agent metadata from a sandbox snapshot |
| `AGENT_METADATA_PATH` | Path to the metadata file (`/.agent-metadata.json`) |
```

### 3. `packages/web/.env.example` — Clarify agent vars

The `.env.example` already has `AGENT_TYPE`, `OPENAI_API_KEY`, and `CODEX_API_KEY`. Add a comment explaining the relationship:

```bash
# Agent selection (optional — defaults to "gemini").
# When using a custom snapshot with baked-in metadata, AGENT_TYPE is not needed.
AGENT_TYPE=gemini
```

## Verification

```bash
# 1. Type-check the consumer app
pnpm --filter demo typecheck

# 2. Full monorepo build
pnpm build

# 3. Full monorepo typecheck
pnpm typecheck
```

Manual E2E verification:

1. **Default behavior (no agent config):**
   - Unset `AGENT_TYPE` and `SANDBOX_SNAPSHOT_ID` in `.env.local`.
   - `giselle()` called without `agent` — should work as before (Gemini default on Cloud API side).

2. **Codex via env:**
   - Set `AGENT_TYPE=codex` and `SANDBOX_SNAPSHOT_ID=<codex-snapshot>`.
   - Chat in browser → Codex agent responds.

3. **Custom snapshot via env:**
   - Set `SANDBOX_SNAPSHOT_ID=<custom-snapshot-with-metadata>` (no `AGENT_TYPE` needed).
   - Chat in browser → agent type auto-detected from snapshot metadata.

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/web/app/api/chat/route.ts` | **Modify** (add `resolveAgentConfig()`, pass `agent` to `giselle()`) |
| `README.md` | **Modify** (document agent selection, update package tables) |
| `packages/web/.env.example` | **Modify** (clarify agent var comments) |

## Done Criteria

- [ ] `packages/web/app/api/chat/route.ts` passes agent config to `giselle()`
- [ ] `README.md` documents per-request agent selection with code examples
- [ ] `README.md` package tables include new exports
- [ ] `.env.example` comments explain agent variable relationships
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Build passes: `pnpm build`
- [ ] Backward-compatible: no `agent` config produces identical behavior to before
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
