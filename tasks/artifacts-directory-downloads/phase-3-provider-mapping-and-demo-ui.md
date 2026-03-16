# Phase 3: Provider Mapping and Demo UI

> **GitHub Issue:** #TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1, Phase 2
> **Parallel with:** None
> **Blocks:** Phase 4

## Objective

Map runtime artifact events into structured client-visible parts and update the workspace report demo to render actual download buttons from those parts.

## What You're Building

```mermaid
sequenceDiagram
    participant Runtime as chat-run NDJSON
    participant Mapper as ndjson-mapper.ts
    participant Provider as giselle-agent-model
    participant Demo as workspace-report-demo

    Runtime->>Mapper: { type: "artifact", path, size_bytes, mime_type }
    Mapper->>Provider: structured stream parts
    Provider->>Demo: UIMessage parts
    Demo->>Demo: render artifact cards
    Demo->>AgentAPI: GET /agent-api/files?... on click

    style Runtime fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Mapper fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Provider fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Demo fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Deliverables

### 1. `packages/giselle-provider/src/ndjson-mapper.ts`

Add support for artifact events.

Recommended transport strategy:
- use the existing dynamic/provider-executed tool-call/tool-result pattern
- assign `toolName: "artifact"`
- put the artifact metadata in the result payload

Example:

```ts
parts.push({
  type: "tool-call",
  toolCallId: artifactId,
  toolName: "artifact",
  input: JSON.stringify(event),
  providerExecuted: true,
  dynamic: true,
});
parts.push({
  type: "tool-result",
  toolCallId: artifactId,
  toolName: "artifact",
  result: event,
  isError: false,
  dynamic: true,
});
```

This keeps artifact handling aligned with existing provider patterns.

### 2. `packages/giselle-provider/src/__tests__/ndjson-mapper.test.ts`

Add tests for:
- single artifact event
- multiple artifact events in one stream
- artifact events interleaved with text and snapshot events

### 3. `examples/workspace-report-demo/lib/agent.ts`

Update the demo prompt so user-facing outputs are written under `./artifacts/` rather than `./workspace/output/`.

Expected behavior:
- source inputs remain under `./workspace/`
- final downloadable outputs go under `./artifacts/`

### 4. `examples/workspace-report-demo/app/chat-panel.tsx`

Render artifact cards from structured message parts.

At minimum:
- inspect assistant tool results for `toolName === "artifact"`
- extract metadata (`path`, `size_bytes`, `mime_type`)
- build a download URL using the session/chat ID

Suggested link:

```ts
`/agent-api/files?chat_id=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}&download=1`
```

The component should stop relying on fixed expected output file paths for download UI.

### 5. `examples/workspace-report-demo/app/page.tsx`

Adjust static copy so it explains the artifact directory convention and no longer presents `./workspace/output/...` as the user-facing destination.

## Verification

1. **Automated checks**
   - `pnpm --filter @giselles-ai/giselle-provider test`
   - `pnpm --filter @giselles-ai/giselle-provider typecheck`
   - `pnpm --dir examples/workspace-report-demo lint`

2. **Manual test scenarios**
   1. ask the demo to create a report → assistant response includes artifact cards → clicking one downloads the file
   2. ask for a revision that changes artifact filenames → UI reflects the actual discovered files rather than hardcoded file names
   3. assistant text and artifact cards both appear in the same turn without UI breakage

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/giselle-provider/src/ndjson-mapper.ts` | **Modify** (artifact event mapping) |
| `packages/giselle-provider/src/__tests__/ndjson-mapper.test.ts` | **Modify** (artifact tests) |
| `packages/giselle-provider/src/__tests__/giselle-agent-model.test.ts` | **Modify if needed** (end-to-end stream coverage) |
| `examples/workspace-report-demo/lib/agent.ts` | **Modify** (switch output convention to `./artifacts/`) |
| `examples/workspace-report-demo/app/chat-panel.tsx` | **Modify** (artifact UI + download links) |
| `examples/workspace-report-demo/app/page.tsx` | **Modify** (copy and expectations) |

## Done Criteria

- [ ] Provider maps artifact events into structured stream parts
- [ ] Provider tests cover artifact events
- [ ] Workspace report demo writes user-facing outputs under `./artifacts/`
- [ ] Demo renders download links from artifact metadata rather than hardcoded paths
- [ ] Manual download scenarios work
- [ ] Build/typecheck commands pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
