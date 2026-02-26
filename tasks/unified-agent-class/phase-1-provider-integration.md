# Phase 1: Provider Integration

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 0 (Agent class must exist)
> **Blocks:** Phase 2

## Objective

Update `packages/giselle-provider` to depend on `@giselles-ai/sandbox-agent` and accept `Agent` instances instead of `GiselleAgentConfig` plain objects. Call `agent.prepare()` inside `doStream()` to automatically materialize pending mutations before connecting to the Cloud API. This is a **breaking change** — `GiselleAgentConfig` is removed.

## What You're Building

```mermaid
sequenceDiagram
    participant Model as GiselleAgentModel
    participant Agent as Agent instance
    participant Cloud as Cloud API

    Model->>Model: doStream() called
    Model->>Agent: check agent.dirty

    alt dirty === true
        Model->>Agent: await agent.prepare()
        Note right of Agent: Creates sandbox, applies ops, snapshots
    end

    Model->>Agent: read agent.type, agent.snapshotId
    Model->>Cloud: POST { agent_type, snapshot_id }

    style Model fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Agent fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Cloud fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Deliverables

### 1. `packages/giselle-provider/package.json`

Add `@giselles-ai/sandbox-agent` as a dependency:

```diff
 "dependencies": {
   "@ai-sdk/provider": "3.0.7",
   "@ai-sdk/provider-utils": "4.0.13",
+  "@giselles-ai/sandbox-agent": "workspace:*",
   "ioredis": "5.9.3",
   "zod": "4.3.6"
 },
```

### 2. `packages/giselle-provider/src/types.ts`

Replace `GiselleAgentConfig` with an `Agent` import. Make `agent` required in `GiselleProviderOptions`:

**Before:**
```typescript
export type GiselleAgentConfig = {
  type?: "gemini" | "codex";
  snapshotId?: string;
};

export type GiselleProviderOptions = {
  cloudApiUrl: string;
  headers?: Record<string, string>;
  agent?: GiselleAgentConfig;
  deps?: Partial<GiselleProviderDeps>;
};
```

**After:**
```typescript
import type { Agent } from "@giselles-ai/sandbox-agent";

// GiselleAgentConfig — DELETED entirely

export type GiselleProviderOptions = {
  cloudApiUrl: string;
  headers?: Record<string, string>;
  agent: Agent;
  deps?: Partial<GiselleProviderDeps>;
};
```

Also remove `GiselleAgentConfig` from the exports list in this file.

### 3. `packages/giselle-provider/src/giselle-agent-model.ts`

Update `doStream()` to call `agent.prepare()` before creating the stream. The key change is in the `startNewSessionStream` method (or `runStream`) — add the prepare call at the beginning, with a detailed code comment explaining why:

**In `runStream()` method, before the existing logic:**
```typescript
private async runStream(input: { ... }): Promise<void> {
  try {
    input.controller.enqueue({
      type: "response-metadata",
      id: input.providerSessionId,
    });

    // --- NEW: Materialize pending Agent mutations before streaming ---
    // When the user calls agent.addFiles() or agent.runCommands(), those
    // operations are lazily queued. We materialize them here — inside
    // doStream() — because this is the first async context where we can
    // perform the Sandbox create → apply → snapshot cycle. The resulting
    // snapshotId is then used for the Cloud API call below.
    //
    // This is intentionally placed in doStream() rather than in the
    // giselle() factory function, because the factory is synchronous
    // and returns a LanguageModelV3 instance immediately.
    if (this.options.agent.dirty) {
      await this.options.agent.prepare();
    }

    // ... existing resume / new session logic unchanged ...
  }
}
```

**Update `connectCloudApi()` to read from Agent:**
```typescript
private async connectCloudApi(
  options: LanguageModelV3CallOptions,
  resumeData?: {
    sessionId?: string;
    sandboxId?: string;
  },
): Promise<LiveConnection> {
  const response = await this.deps.connectCloudApi({
    endpoint: buildCloudEndpoint(this.options.cloudApiUrl),
    message: this.extractUserMessage(options.prompt),
    sessionId: resumeData?.sessionId,
    sandboxId: resumeData?.sandboxId,
    agentType: this.options.agent.type,        // was: this.options.agent?.type
    snapshotId: this.options.agent.snapshotId,  // was: this.options.agent?.snapshotId
    headers: this.mergeCloudHeaders(options.headers),
    signal: options.abortSignal,
  });

  return {
    reader: response.reader,
    buffer: "",
    relaySubscription: null,
    textBlockOpen: false,
  };
}
```

### 4. `packages/giselle-provider/src/index.ts`

Remove the `GiselleAgentConfig` re-export. The `Agent` type is already exported from `@giselles-ai/sandbox-agent`, so consumers import it from there:

**Before:**
```typescript
export type {
  ConnectCloudApiParams,
  ConnectCloudApiResult,
  GiselleAgentConfig,
  GiselleProviderDeps,
  GiselleProviderOptions,
  LiveConnection,
  RelaySubscription,
  SessionMetadata,
} from "./types";
```

**After:**
```typescript
export type {
  ConnectCloudApiParams,
  ConnectCloudApiResult,
  GiselleProviderDeps,
  GiselleProviderOptions,
  LiveConnection,
  RelaySubscription,
  SessionMetadata,
} from "./types";
```

## Verification

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Typecheck:**
   ```bash
   cd packages/giselle-provider && pnpm typecheck
   ```

3. **Build both packages** (sandbox-agent must build first since provider depends on it):
   ```bash
   pnpm --filter @giselles-ai/sandbox-agent build
   pnpm --filter @giselles-ai/giselle-provider build
   ```

4. **Note:** `packages/web` will have type errors at this point — that is expected and will be fixed in Phase 2.

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/giselle-provider/package.json` | **Modify** (add `@giselles-ai/sandbox-agent` dependency) |
| `packages/giselle-provider/src/types.ts` | **Modify** (replace `GiselleAgentConfig` with `Agent` import, make `agent` required) |
| `packages/giselle-provider/src/giselle-agent-model.ts` | **Modify** (add `prepare()` call in `runStream`, update `connectCloudApi` field access) |
| `packages/giselle-provider/src/index.ts` | **Modify** (remove `GiselleAgentConfig` from re-exports) |

## Done Criteria

- [ ] `@giselles-ai/sandbox-agent` is listed as a dependency
- [ ] `GiselleAgentConfig` type is deleted — `GiselleProviderOptions.agent` is typed as `Agent`
- [ ] `agent` field in `GiselleProviderOptions` is required (not optional)
- [ ] `runStream()` calls `agent.prepare()` when `agent.dirty` is true, with explanatory comment
- [ ] `connectCloudApi()` reads `agent.type` and `agent.snapshotId` directly (no optional chaining)
- [ ] `GiselleAgentConfig` is removed from `index.ts` re-exports
- [ ] `pnpm typecheck` passes for `giselle-provider`
- [ ] `pnpm build` succeeds for both `sandbox-agent` and `giselle-provider`
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
