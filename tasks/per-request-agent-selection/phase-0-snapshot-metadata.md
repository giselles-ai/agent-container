# Phase 0: Snapshot Agent Metadata

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** None (can start immediately)
> **Parallel with:** Phase 1
> **Blocks:** Phase 2

## Objective

Bake a `/.agent-metadata.json` file into every snapshot during creation, and provide a helper function to read it from a running sandbox. This makes snapshots self-describing — the system can determine which CLI backend a snapshot uses without external configuration.

## What You're Building

```mermaid
flowchart LR
    Script["create-browser-tool-snapshot.mjs"] -->|writeFiles| Meta["/.agent-metadata.json"]
    Meta -->|contains| JSON["{\"cli\": \"gemini\" | \"codex\"}"]
    Helper["readAgentMetadata(sandbox)"] -->|readFileToBuffer| Meta
    Helper -->|returns| Parsed["AgentMetadata | null"]

    style Script fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Helper fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
    style Meta fill:#1a1a2e,stroke:#e94560,color:#ffffff
```

## Deliverables

### 1. `packages/sandbox-agent/src/agents/agent-metadata.ts`

A small helper module for reading agent metadata from a sandbox.

```typescript
import type { Sandbox } from "@vercel/sandbox";

export const AGENT_METADATA_PATH = "/.agent-metadata.json";

export type AgentMetadata = {
	cli: "gemini" | "codex";
};

/**
 * Read agent metadata from a sandbox. Returns null if the file
 * does not exist or cannot be parsed.
 */
export async function readAgentMetadata(
	sandbox: Sandbox,
): Promise<AgentMetadata | null> {
	const buffer = await sandbox.readFileToBuffer({
		path: AGENT_METADATA_PATH,
	});
	if (!buffer) {
		return null;
	}

	try {
		const parsed = JSON.parse(new TextDecoder().decode(buffer));
		if (
			parsed &&
			typeof parsed === "object" &&
			(parsed.cli === "gemini" || parsed.cli === "codex")
		) {
			return parsed as AgentMetadata;
		}
		return null;
	} catch {
		return null;
	}
}
```

### 2. `packages/sandbox-agent/src/agents/agent-metadata.test.ts`

Follow the test patterns from `gemini-agent.test.ts` and `codex-agent.test.ts`:

```typescript
import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it, vi } from "vitest";
import { readAgentMetadata, AGENT_METADATA_PATH } from "./agent-metadata";

function createMockSandbox(
	fileContent: Buffer | null,
): Sandbox {
	return {
		readFileToBuffer: vi.fn(async () => fileContent),
	} as unknown as Sandbox;
}

describe("readAgentMetadata", () => {
	it("returns metadata for gemini snapshot", async () => {
		const sandbox = createMockSandbox(
			Buffer.from(JSON.stringify({ cli: "gemini" })),
		);
		const result = await readAgentMetadata(sandbox);
		expect(result).toEqual({ cli: "gemini" });
		expect(sandbox.readFileToBuffer).toHaveBeenCalledWith({
			path: AGENT_METADATA_PATH,
		});
	});

	it("returns metadata for codex snapshot", async () => {
		const sandbox = createMockSandbox(
			Buffer.from(JSON.stringify({ cli: "codex" })),
		);
		const result = await readAgentMetadata(sandbox);
		expect(result).toEqual({ cli: "codex" });
	});

	it("returns null when file does not exist", async () => {
		const sandbox = createMockSandbox(null);
		const result = await readAgentMetadata(sandbox);
		expect(result).toBeNull();
	});

	it("returns null for invalid JSON", async () => {
		const sandbox = createMockSandbox(Buffer.from("not json"));
		const result = await readAgentMetadata(sandbox);
		expect(result).toBeNull();
	});

	it("returns null for unknown cli value", async () => {
		const sandbox = createMockSandbox(
			Buffer.from(JSON.stringify({ cli: "unknown" })),
		);
		const result = await readAgentMetadata(sandbox);
		expect(result).toBeNull();
	});
});
```

### 3. `packages/sandbox-agent/src/index.ts` — Add export

Add the metadata exports alongside existing ones:

```typescript
export { readAgentMetadata, AGENT_METADATA_PATH, type AgentMetadata } from "./agents/agent-metadata";
```

### 4. `scripts/create-browser-tool-snapshot.mjs` — Write metadata file

In the `main()` function, after the artifact validation step and before writing gemini settings, add:

```javascript
console.log(`[snapshot] writing agent metadata (cli: ${SNAPSHOT_AGENT})...`);
await sandbox.writeFiles([{
  path: '/.agent-metadata.json',
  content: Buffer.from(JSON.stringify({ cli: SNAPSHOT_AGENT })),
}]);
```

This should be placed around line 298 (after the validation block, before the `if (SNAPSHOT_AGENT === "gemini")` conditional).

## Verification

```bash
# 1. Type-check the package
pnpm --filter @giselles-ai/sandbox-agent typecheck

# 2. Run tests
pnpm --filter @giselles-ai/sandbox-agent test

# 3. Build
pnpm --filter @giselles-ai/sandbox-agent build

# 4. Verify the snapshot script is syntactically valid
node --check scripts/create-browser-tool-snapshot.mjs
```

Manual verification (optional, requires Vercel Sandbox access):

1. Run `pnpm snapshot:browser-tool` (gemini) and `pnpm snapshot:browser-tool:codex`.
2. Create a sandbox from each snapshot.
3. Read `/.agent-metadata.json` — confirm `{"cli":"gemini"}` and `{"cli":"codex"}` respectively.

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/sandbox-agent/src/agents/agent-metadata.ts` | **Create** |
| `packages/sandbox-agent/src/agents/agent-metadata.test.ts` | **Create** |
| `packages/sandbox-agent/src/index.ts` | **Modify** (add metadata exports) |
| `scripts/create-browser-tool-snapshot.mjs` | **Modify** (write `/.agent-metadata.json` during snapshot creation) |

## Done Criteria

- [ ] `agent-metadata.ts` exports `readAgentMetadata()`, `AGENT_METADATA_PATH`, and `AgentMetadata` type
- [ ] `readAgentMetadata()` returns parsed metadata or `null` gracefully
- [ ] All tests pass: `pnpm --filter @giselles-ai/sandbox-agent test`
- [ ] Typecheck passes: `pnpm --filter @giselles-ai/sandbox-agent typecheck`
- [ ] Snapshot script writes `/.agent-metadata.json` with `{ "cli": "<agent>" }`
- [ ] Exports added to `packages/sandbox-agent/src/index.ts`
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
