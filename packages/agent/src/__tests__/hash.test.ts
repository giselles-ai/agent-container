import { describe, expect, it } from "vitest";

import { computeConfigHash } from "../hash";

describe("computeConfigHash", () => {
	it("produces a 16-char hex string", () => {
		const hash = computeConfigHash({});
		expect(hash).toMatch(/^[0-9a-f]{16}$/);
		expect(hash).toHaveLength(16);
	});

	it("produces same hash for same input", () => {
		const config = { agentType: "gemini" as const, agentMd: "test" };
		const a = computeConfigHash(config);
		const b = computeConfigHash(config);
		expect(a).toBe(b);
	});

	it("produces different hash for different agentType", () => {
		const a = computeConfigHash({ agentType: "gemini" });
		const b = computeConfigHash({ agentType: "codex" });
		expect(a).not.toBe(b);
	});

	it("produces different hash for different agentMd", () => {
		const a = computeConfigHash({ agentMd: "a" });
		const b = computeConfigHash({ agentMd: "b" });
		expect(a).not.toBe(b);
	});

	it("produces different hash when files order changes", () => {
		const a = computeConfigHash({
			files: [
				{ path: "/a", content: "1" },
				{ path: "/b", content: "2" },
			],
		});
		const b = computeConfigHash({
			files: [
				{ path: "/b", content: "2" },
				{ path: "/a", content: "1" },
			],
		});
		expect(a).not.toBe(b);
	});

	it("produces different hash when setup changes", () => {
		const a = computeConfigHash({
			setup: { script: "npm install -g tsx" },
		});
		const b = computeConfigHash({
			setup: { script: "npm install -g jq" },
		});
		expect(a).not.toBe(b);
	});

	it("produces same hash for same setup", () => {
		const config = {
			setup: { script: "npx opensrc vercel/ai" },
		};
		const a = computeConfigHash(config);
		const b = computeConfigHash(config);
		expect(a).toBe(b);
	});

	it("produces different hash when env changes", () => {
		const a = computeConfigHash({
			env: {
				FOO: "1",
			},
		});
		const b = computeConfigHash({
			env: {
				FOO: "2",
			},
		});
		expect(a).not.toBe(b);
	});

	it("produces same hash for same env", () => {
		const config = {
			env: {
				FOO: "1",
				BAR: "2",
			},
		};
		const a = computeConfigHash(config);
		const b = computeConfigHash(config);
		expect(a).toBe(b);
	});

	it("produces different hash with env vs without", () => {
		const a = computeConfigHash({});
		const b = computeConfigHash({ env: { FOO: "bar" } });
		expect(a).not.toBe(b);
	});

	it("produces same hash regardless of env key insertion order", () => {
		const a = computeConfigHash({ env: { A: "1", B: "2" } });
		const b = computeConfigHash({ env: { B: "2", A: "1" } });
		expect(a).toBe(b);
	});

	it("produces different hash with setup vs without", () => {
		const a = computeConfigHash({});
		const b = computeConfigHash({
			setup: { script: "echo hello" },
		});
		expect(a).not.toBe(b);
	});
});
