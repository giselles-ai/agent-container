import { describe, expect, it } from "vitest";

import { defineAgent } from "../define-agent";

describe("defineAgent", () => {
	it("returns a DefinedAgent with defaults", () => {
		const agent = defineAgent({});
		expect(agent.agentType).toBe("gemini");
		expect(agent.files).toEqual([]);
		expect(agent.setup).toBeUndefined();
		expect(agent.agentMd).toBeUndefined();
	});

	it("preserves provided config", () => {
		const agent = defineAgent({
			agentType: "codex",
			agentMd: "test prompt",
			files: [{ path: "/test", content: "hello" }],
			setup: { script: "npm install -g tsx" },
		});
		expect(agent.agentType).toBe("codex");
		expect(agent.agentMd).toBe("test prompt");
		expect(agent.files).toHaveLength(1);
		expect(agent.files[0]).toEqual({
			path: "/test",
			content: "hello",
		});
		expect(agent.setup).toEqual({ script: "npm install -g tsx" });
	});

	it("leaves setup undefined when not provided", () => {
		const agent = defineAgent({});
		expect(agent.setup).toBeUndefined();
	});

	it("preserves provided setup script", () => {
		const agent = defineAgent({
			setup: { script: "npm install -g tsx" },
		});
		expect(agent.setup).toEqual({ script: "npm install -g tsx" });
	});

	it("throws when snapshotId is accessed without env", () => {
		const agent = defineAgent({});
		expect(() => agent.snapshotId).toThrow(
			"GISELLE_AGENT_SNAPSHOT_ID is not set",
		);
	});

	it("returns snapshotId from env", () => {
		process.env.GISELLE_AGENT_SNAPSHOT_ID = "snap_test123";
		try {
			const agent = defineAgent({});
			expect(agent.snapshotId).toBe("snap_test123");
		} finally {
			delete process.env.GISELLE_AGENT_SNAPSHOT_ID;
		}
	});
});
