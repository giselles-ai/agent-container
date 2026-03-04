# Phase 0: Agent.setAgentMd() Method

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** None
> **Blocks:** Phase 1

## Objective

Add a `setAgentMd()` method to the `Agent` class that accepts a `string | Buffer` and queues a `writeFiles` operation for `AGENTS.md`. This encapsulates the convention that both Codex and Gemini CLI read `AGENTS.md` from the working directory.

## What You're Building

```mermaid
flowchart LR
    Call["agent.setAgentMd(prompt)"] --> Queue["_pendingOps.push(writeFiles)"]
    Queue --> Prepare["agent.prepare()"]
    Prepare --> Write["sandbox.writeFiles([AGENTS.md])"]

    style Call fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Queue fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Prepare fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Write fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Deliverables

### 1. Modify `packages/sandbox-agent/src/agent.ts` — add `setAgentMd()`

Add the method after the existing `addFiles()` method (around L60). It delegates to `addFiles()` internally.

The sandbox home directory is `/home/vercel-sandbox` — this is the same convention used by:
- `codex-agent.ts`: `const CODEX_CONFIG_PATH = "/home/vercel-sandbox/.codex/config.toml"`
- `gemini-agent.ts`: `const GEMINI_SETTINGS_PATH = "/home/vercel-sandbox/.gemini/settings.json"`

```typescript
setAgentMd(content: string | Buffer): this {
    const buffer = typeof content === "string" ? Buffer.from(content) : content;
    return this.addFiles([{ path: "/home/vercel-sandbox/AGENTS.md", content: buffer }]);
}
```

**Design decisions:**
- Accepts `string | Buffer` for convenience — most callers will pass a string.
- Delegates to `addFiles()` — reuses the existing `writeFiles` op queuing.
- Uses absolute path `/home/vercel-sandbox/AGENTS.md` — matches the sandbox home directory convention used by codex/gemini config files. Both CLI agents read `AGENTS.md` from the home/working directory.
- Returns `this` for chaining (inherited from `addFiles()`).

### 2. Modify `packages/sandbox-agent/src/agent.test.ts` — add tests

Add a new `describe("setAgentMd", ...)` block after the `addFiles` tests (around L62):

```typescript
describe("setAgentMd", () => {
    it("marks agent as dirty", () => {
        const agent = Agent.create("codex", { snapshotId: "snap_abc" });
        agent.setAgentMd("You are a helpful assistant.");
        expect(agent.dirty).toBe(true);
    });

    it("is chainable", () => {
        const agent = Agent.create("codex", { snapshotId: "snap_abc" });
        const result = agent.setAgentMd("instructions");
        expect(result).toBe(agent);
    });

    it("accepts a Buffer", () => {
        const agent = Agent.create("codex", { snapshotId: "snap_abc" });
        agent.setAgentMd(Buffer.from("instructions"));
        expect(agent.dirty).toBe(true);
    });

    it("writes AGENTS.md to sandbox home during prepare", async () => {
        const writeFiles = vi.fn(async () => undefined);
        const snapshot = vi.fn(async () => ({ snapshotId: "snap_new" }));
        sandboxCreate.mockResolvedValue({
            writeFiles,
            runCommand: vi.fn(),
            snapshot,
        });

        const agent = Agent.create("codex", { snapshotId: "snap_abc" });
        agent.setAgentMd("You are a spreadsheet assistant.");

        await agent.prepare();

        expect(writeFiles).toHaveBeenCalledWith([
            { path: "/home/vercel-sandbox/AGENTS.md", content: Buffer.from("You are a spreadsheet assistant.") },
        ]);
        expect(agent.snapshotId).toBe("snap_new");
    });
});
```

## Verification

1. **Run unit tests:**
   ```bash
   pnpm vitest run --filter=sandbox-agent
   ```
2. **TypeScript build:**
   ```bash
   pnpm turbo build --filter=@giselles-ai/sandbox-agent
   ```

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/sandbox-agent/src/agent.ts` | **Modify** — add `setAgentMd()` method |
| `packages/sandbox-agent/src/agent.test.ts` | **Modify** — add `setAgentMd` test block |

## Done Criteria

- [ ] `setAgentMd(string | Buffer)` method exists on `Agent` class
- [ ] Method delegates to `addFiles()` with path `AGENTS.md`
- [ ] All 4 new tests pass
- [ ] Existing tests still pass
- [ ] Build passes
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
