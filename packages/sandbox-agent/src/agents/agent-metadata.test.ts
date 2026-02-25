import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it, vi } from "vitest";
import { AGENT_METADATA_PATH, readAgentMetadata } from "./agent-metadata";

function createMockSandbox(fileContent: Buffer | null): Sandbox {
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
