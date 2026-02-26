import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "./agent";

const { sandboxCreate } = vi.hoisted(() => ({
	sandboxCreate: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
	Sandbox: {
		create: sandboxCreate,
	},
}));

describe("Agent", () => {
	beforeEach(() => {
		sandboxCreate.mockReset();
	});

	describe("create", () => {
		it("creates an agent with type and snapshotId", () => {
			const agent = Agent.create("codex", { snapshotId: "snap_abc" });
			expect(agent.type).toBe("codex");
			expect(agent.snapshotId).toBe("snap_abc");
			expect(agent.dirty).toBe(false);
		});

		it("trims snapshotId", () => {
			const agent = Agent.create("gemini", { snapshotId: "  snap_abc  " });
			expect(agent.snapshotId).toBe("snap_abc");
		});

		it("throws on empty snapshotId", () => {
			expect(() => Agent.create("codex", { snapshotId: "" })).toThrow(
				"snapshotId is required",
			);
			expect(() => Agent.create("codex", { snapshotId: "   " })).toThrow(
				"snapshotId is required",
			);
		});
	});

	describe("addFiles", () => {
		it("marks agent as dirty", () => {
			const agent = Agent.create("codex", { snapshotId: "snap_abc" });
			agent.addFiles([{ path: "/app/data.json", content: Buffer.from("{}") }]);
			expect(agent.dirty).toBe(true);
		});

		it("is chainable", () => {
			const agent = Agent.create("codex", { snapshotId: "snap_abc" });
			const result = agent.addFiles([
				{ path: "/a.txt", content: Buffer.from("a") },
			]);
			expect(result).toBe(agent);
		});

		it("ignores empty array", () => {
			const agent = Agent.create("codex", { snapshotId: "snap_abc" });
			agent.addFiles([]);
			expect(agent.dirty).toBe(false);
		});
	});

	describe("runCommands", () => {
		it("marks agent as dirty", () => {
			const agent = Agent.create("codex", { snapshotId: "snap_abc" });
			agent.runCommands([{ cmd: "npm", args: ["install"] }]);
			expect(agent.dirty).toBe(true);
		});

		it("is chainable", () => {
			const agent = Agent.create("codex", { snapshotId: "snap_abc" });
			const result = agent.runCommands([{ cmd: "echo", args: ["hi"] }]);
			expect(result).toBe(agent);
		});
	});

	describe("prepare", () => {
		it("is a no-op when not dirty", async () => {
			const agent = Agent.create("codex", { snapshotId: "snap_abc" });
			await agent.prepare();
			expect(sandboxCreate).not.toHaveBeenCalled();
			expect(agent.snapshotId).toBe("snap_abc");
		});

		it("creates sandbox, applies ops, snapshots, and updates snapshotId", async () => {
			const writeFiles = vi.fn(async () => undefined);
			const runCommand = vi.fn(async () => undefined);
			const snapshot = vi.fn(async () => ({ snapshotId: "snap_new" }));
			sandboxCreate.mockResolvedValue({
				writeFiles,
				runCommand,
				snapshot,
			});

			const agent = Agent.create("codex", { snapshotId: "snap_abc" });
			agent
				.addFiles([{ path: "/a.txt", content: Buffer.from("hello") }])
				.runCommands([{ cmd: "npm", args: ["install"] }]);

			await agent.prepare();

			expect(sandboxCreate).toHaveBeenCalledWith({
				source: { type: "snapshot", snapshotId: "snap_abc" },
			});
			expect(writeFiles).toHaveBeenCalledWith([
				{ path: "/a.txt", content: Buffer.from("hello") },
			]);
			expect(runCommand).toHaveBeenCalledWith("npm", ["install"]);
			expect(snapshot).toHaveBeenCalled();
			expect(agent.snapshotId).toBe("snap_new");
			expect(agent.dirty).toBe(false);
		});

		it("applies operations in order", async () => {
			const callOrder: string[] = [];
			const writeFiles = vi.fn(async () => {
				callOrder.push("writeFiles");
			});
			const runCommand = vi.fn(async (cmd: string) => {
				callOrder.push(`runCommand:${cmd}`);
			});
			const snapshot = vi.fn(async () => ({ snapshotId: "snap_new" }));
			sandboxCreate.mockResolvedValue({
				writeFiles,
				runCommand,
				snapshot,
			});

			const agent = Agent.create("gemini", { snapshotId: "snap_abc" });
			agent
				.addFiles([{ path: "/a.txt", content: Buffer.from("a") }])
				.runCommands([{ cmd: "apt", args: ["install", "curl"] }])
				.addFiles([{ path: "/b.txt", content: Buffer.from("b") }]);

			await agent.prepare();

			expect(callOrder).toEqual([
				"writeFiles",
				"runCommand:apt",
				"writeFiles",
			]);
		});
	});
});
