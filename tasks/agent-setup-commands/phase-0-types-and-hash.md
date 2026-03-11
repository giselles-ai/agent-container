# Phase 0: Types & Hash

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** None
> **Blocks:** Phase 1

## Objective

Add the `SetupCommand` type and `setup` field to `AgentConfig` / `DefinedAgent`, update `defineAgent()` to pass it through, and include it in `computeConfigHash()` so that changing setup commands triggers a new build.

## What You're Building

```mermaid
flowchart LR
    A[SetupCommand type] --> B[AgentConfig.setup?]
    B --> C[DefinedAgent.setup]
    B --> D[computeConfigHash includes setup]
    B --> E[defineAgent passes setup through]

    style A fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style B fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style C fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style D fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style E fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Deliverables

### 1. `packages/agent/src/types.ts` — Add `SetupCommand` and `setup` field

Add the new type and optional field:

```ts
export type SetupCommand = {
  /** The command to run (e.g. "npm", "npx", "git", "bash"). */
  command: string;
  /** Arguments to pass to the command. */
  args: string[];
};

export type AgentConfig = {
  /** Agent type. Defaults to "gemini". */
  agentType?: "gemini" | "codex";
  /** Content for AGENTS.md in the sandbox. */
  agentMd?: string;
  /** Additional files to write into the sandbox. */
  files?: AgentFile[];
  /** Commands to run inside the sandbox during build, after file writes. */
  setup?: SetupCommand[];
};

export type DefinedAgent = {
  readonly agentType: "gemini" | "codex";
  readonly agentMd?: string;
  readonly files: AgentFile[];
  /** Setup commands to run during build. */
  readonly setup: SetupCommand[];
  /** Snapshot ID resolved from env at runtime. Throws if not set. */
  readonly snapshotId: string;
};
```

### 2. `packages/agent/src/define-agent.ts` — Pass `setup` through

```ts
export function defineAgent(config: AgentConfig): DefinedAgent {
  return {
    agentType: config.agentType ?? "gemini",
    agentMd: config.agentMd,
    files: config.files ?? [],
    setup: config.setup ?? [],
    get snapshotId(): string {
      const id = process.env?.GISELLE_AGENT_SNAPSHOT_ID;
      if (!id) {
        throw new Error(
          `GISELLE_AGENT_SNAPSHOT_ID is not set. Ensure withGiselleAgent is configured in next.config.ts.`,
        );
      }
      return id;
    },
  };
}
```

### 3. `packages/agent/src/hash.ts` — Include `setup` in hash

```ts
export function computeConfigHash(config: AgentConfig): string {
  const payload = JSON.stringify({
    agentType: config.agentType ?? "gemini",
    agentMd: config.agentMd ?? null,
    files: (config.files ?? []).map((f) => ({
      path: f.path,
      content: f.content,
    })),
    setup: (config.setup ?? []).map((s) => ({
      command: s.command,
      args: s.args,
    })),
  });

  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
```

### 4. Update existing tests and add new ones

**`packages/agent/src/__tests__/define-agent.test.ts`** — Add:

```ts
it("defaults setup to empty array", () => {
  const agent = defineAgent({});
  expect(agent.setup).toEqual([]);
});

it("preserves provided setup commands", () => {
  const agent = defineAgent({
    setup: [
      { command: "npm", args: ["install", "-g", "tsx"] },
      { command: "npx", args: ["opensrc", "vercel/ai"] },
    ],
  });
  expect(agent.setup).toHaveLength(2);
  expect(agent.setup[0]).toEqual({ command: "npm", args: ["install", "-g", "tsx"] });
  expect(agent.setup[1]).toEqual({ command: "npx", args: ["opensrc", "vercel/ai"] });
});
```

**`packages/agent/src/__tests__/hash.test.ts`** — Add:

```ts
it("produces different hash when setup changes", () => {
  const a = computeConfigHash({
    setup: [{ command: "npm", args: ["install", "-g", "tsx"] }],
  });
  const b = computeConfigHash({
    setup: [{ command: "npm", args: ["install", "-g", "jq"] }],
  });
  expect(a).not.toBe(b);
});

it("produces same hash for same setup", () => {
  const config = {
    setup: [{ command: "npx", args: ["opensrc", "vercel/ai"] }],
  };
  const a = computeConfigHash(config);
  const b = computeConfigHash(config);
  expect(a).toBe(b);
});

it("produces different hash with setup vs without", () => {
  const a = computeConfigHash({});
  const b = computeConfigHash({
    setup: [{ command: "echo", args: ["hello"] }],
  });
  expect(a).not.toBe(b);
});
```

### 5. Export `SetupCommand` type

**`packages/agent/src/index.ts`** — Add `SetupCommand` to the type export:

```ts
export type { AgentConfig, AgentFile, DefinedAgent, SetupCommand } from "./types";
```

## Verification

1. **Typecheck:**
   ```bash
   pnpm --filter @giselles-ai/agent exec tsc --noEmit
   ```

2. **Tests:**
   ```bash
   pnpm --filter @giselles-ai/agent test
   ```

3. **All tests pass**, including existing ones (backward compatibility).

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/agent/src/types.ts` | **Modify** — add `SetupCommand` type, add `setup` to `AgentConfig` and `DefinedAgent` |
| `packages/agent/src/define-agent.ts` | **Modify** — add `setup: config.setup ?? []` |
| `packages/agent/src/hash.ts` | **Modify** — add `setup` to hash payload |
| `packages/agent/src/index.ts` | **Modify** — export `SetupCommand` type |
| `packages/agent/src/__tests__/define-agent.test.ts` | **Modify** — add setup tests |
| `packages/agent/src/__tests__/hash.test.ts` | **Modify** — add setup hash tests |

## Done Criteria

- [ ] `SetupCommand` type exported from `@giselles-ai/agent`
- [ ] `AgentConfig.setup` is optional, `DefinedAgent.setup` defaults to `[]`
- [ ] `defineAgent({})` still works (backward compatible)
- [ ] `computeConfigHash` produces different hashes when `setup` changes
- [ ] All existing + new tests pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
