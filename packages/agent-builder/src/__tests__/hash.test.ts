import { describe, expect, it } from "vitest";

import { computeConfigHash } from "../hash";

describe("computeConfigHash", () => {
	it("produces a 16-char hex string", () => {
		const hash = computeConfigHash({}, "snap_base");
		expect(hash).toMatch(/^[0-9a-f]{16}$/);
		expect(hash).toHaveLength(16);
	});

	it("produces same hash for same input", () => {
		const config = { agentType: "gemini" as const, agentMd: "test" };
		const a = computeConfigHash(config, "snap_1");
		const b = computeConfigHash(config, "snap_1");
		expect(a).toBe(b);
	});

	it("produces different hash for different baseSnapshotId", () => {
		const config = { agentMd: "test" };
		const a = computeConfigHash(config, "snap_1");
		const b = computeConfigHash(config, "snap_2");
		expect(a).not.toBe(b);
	});

	it("produces different hash for different agentMd", () => {
		const a = computeConfigHash({ agentMd: "a" }, "snap_1");
		const b = computeConfigHash({ agentMd: "b" }, "snap_1");
		expect(a).not.toBe(b);
	});

	it("produces different hash when files order changes", () => {
		const a = computeConfigHash(
			{
				files: [
					{ path: "/a", content: "1" },
					{ path: "/b", content: "2" },
				],
			},
			"snap_1",
		);
		const b = computeConfigHash(
			{
				files: [
					{ path: "/b", content: "2" },
					{ path: "/a", content: "1" },
				],
			},
			"snap_1",
		);
		expect(a).not.toBe(b);
	});
});
