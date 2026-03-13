import { describe, expect, it } from "vitest";

import { defineAgent } from "../define-agent";

describe("defineAgent with catalog", () => {
	it("appends catalog prompt to agentMd", () => {
		const fakeCatalog = {
			prompt: ({ mode }: { mode?: string } = {}) =>
				`[catalog:${mode ?? "standalone"}]`,
		};
		const agent = defineAgent({
			agentMd: "You are a helper.",
			catalog: fakeCatalog,
		});
		expect(agent.agentMd).toContain("You are a helper.");
		expect(agent.agentMd).toContain("[catalog:inline]");
	});

	it("works without catalog", () => {
		const agent = defineAgent({ agentMd: "Base prompt." });
		expect(agent.agentMd).toBe("Base prompt.");
		expect(agent.catalog).toBeUndefined();
	});

	it("works with catalog but no agentMd", () => {
		const fakeCatalog = {
			prompt: () => "[catalog-prompt]",
		};
		const agent = defineAgent({ catalog: fakeCatalog });
		expect(agent.agentMd).toBe("[catalog-prompt]");
	});
});
