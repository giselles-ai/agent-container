import { describe, expect, it } from "vitest";

import { defineAgent } from "../define-agent";

describe("defineAgent", () => {
	it("returns a DefinedAgent with defaults", () => {
		const agent = defineAgent({});
		expect(agent.agentType).toBe("gemini");
		expect(agent.files).toEqual([]);
		expect(agent.setup).toBeUndefined();
		expect(agent.agentMd).toContain("./artifacts/");
	});

	it("preserves provided config", () => {
		const agent = defineAgent({
			agentType: "codex",
			agentMd: "test prompt",
			files: [{ path: "/test", content: "hello" }],
			setup: { script: "npm install -g tsx" },
		});
		expect(agent.agentType).toBe("codex");
		expect(agent.agentMd).toContain("test prompt");
		expect(agent.agentMd).toContain("./artifacts/");
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

	it("preserves provided env", () => {
		const agent = defineAgent({
			env: {
				FOO: "bar",
			},
		});
		expect(agent.env).toEqual({ FOO: "bar" });
	});

	it("defaults env to empty object", () => {
		const agent = defineAgent({});
		expect(agent.env).toEqual({});
	});

	it("includes the internal artifact prompt before catalog prompt", () => {
		const catalog = {
			prompt: () => "[catalog-prompt]",
		};
		const agent = defineAgent({
			agentMd: "You are a workspace agent.",
			catalog,
		});

		const body = agent.agentMd ?? "";
		expect(body).toContain("You are a workspace agent.");
		expect(body).toContain("## Artifact Convention");
		expect(body).toContain("[catalog-prompt]");
		expect(body.indexOf("## Artifact Convention")).toBeGreaterThan(
			body.indexOf("You are a workspace agent."),
		);
		expect(body.indexOf("[catalog-prompt]")).toBeGreaterThan(
			body.indexOf("## Artifact Convention"),
		);
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
