# Phase 1: Agent API File Endpoint

> **GitHub Issue:** #TBD · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 0
> **Parallel with:** Phase 2
> **Blocks:** Phase 3

## Objective

Add a file-serving endpoint to `createAgentApi()` so apps can download sandbox artifacts by chat session and path. The endpoint must work with both live sandboxes and restored sandboxes created from the latest snapshot.

## What You're Building

```mermaid
sequenceDiagram
    participant Browser as Browser
    participant API as createAgentApi
    participant Store as CloudChatStateStore
    participant Sandbox as Vercel Sandbox

    Browser->>API: GET /agent-api/files?chat_id=chat-1&path=./artifacts/report.md
    API->>Store: load(chat-1)
    alt sandbox alive
        API->>Sandbox: Sandbox.get(sandboxId)
    else sandbox missing or expired
        API->>Sandbox: Sandbox.create(snapshotId)
    end
    API->>Sandbox: readFileToBuffer({ path })
    Sandbox-->>API: bytes
    API-->>Browser: 200 file response

    style Browser fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style API fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Store fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Sandbox fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Deliverables

### 1. `packages/agent/src/agent-api.ts`

Add `/files` route matching to `createAgentApi()`:

```ts
const filesPath = `${basePath}/files`;
```

Handle:
- `GET /files`
- `OPTIONS /files` if needed for consistency

Query parameters:

| Param | Required | Notes |
|---|---|---|
| `chat_id` | yes | identifies stored sandbox/snapshot state |
| `path` | yes | sandbox-relative path, e.g. `./artifacts/report.md` |
| `download` | no | `1` forces `attachment`; otherwise allow `inline` |

### 2. Recovery helper

Implement a helper in `agent-api.ts` or a new local helper file:

```ts
async function resolveReadableSandbox(input: {
  sandboxId?: string;
  snapshotId?: string;
}): Promise<Sandbox>
```

Decision table:

| State | Behavior |
|---|---|
| `sandboxId` exists and `Sandbox.get()` returns running | use it |
| `sandboxId` missing or invalid, `snapshotId` exists | recreate from snapshot |
| neither available | return a clean error |

This logic should intentionally mirror the already established recovery behavior in `chat-run.ts`.

### 3. File response logic

Use `sandbox.readFileToBuffer({ path })` and return:

```ts
new Response(buffer, {
  headers: {
    "Content-Type": mimeType,
    "Content-Disposition": `${mode}; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  },
});
```

Mime inference table:

| Extension | MIME |
|---|---|
| `.md` | `text/markdown; charset=utf-8` |
| `.json` | `application/json; charset=utf-8` |
| `.csv` | `text/csv; charset=utf-8` |
| `.txt` | `text/plain; charset=utf-8` |
| other | `application/octet-stream` |

### 4. Tests

Add endpoint/helper tests covering:
- live sandbox success
- snapshot fallback success
- missing file
- missing `chat_id` or `path`

Prefer unit-style tests around the route helper rather than requiring full HTTP integration.

## Verification

1. **Automated checks**
   - `pnpm --filter @giselles-ai/agent test`
   - `pnpm --filter @giselles-ai/agent typecheck`

2. **Manual test scenarios**
   1. live session + existing file → request download → gets file bytes with correct filename
   2. expired sandbox + valid snapshot → request download → sandbox recreated and file still downloads
   3. missing path or chat id → request → `400`
   4. valid session but missing file → request → `404`

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/agent/src/agent-api.ts` | **Modify** (add `/files` route and helper logic) |
| `packages/agent/src/chat-run.ts` | **Reference** (reuse sandbox recovery semantics) |
| `packages/agent/src/cloud-chat-state.ts` | **Reference** (state fields used to recover the sandbox) |
| `packages/agent/src/*.test.ts` | **Modify/Create** (file endpoint coverage) |

## Done Criteria

- [ ] `GET /agent-api/files` is implemented
- [ ] Live and recovered sandbox reads both work
- [ ] Response headers support inline/download modes
- [ ] Error cases return clean 4xx responses
- [ ] Tests cover the route/helper behavior
- [ ] Build/typecheck commands pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
