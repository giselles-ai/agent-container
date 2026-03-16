import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentApi } from "../agent-api";

const { sandboxCreate, sandboxGet } = vi.hoisted(() => ({
	sandboxCreate: vi.fn(),
	sandboxGet: vi.fn(),
}));
const { resolveCloudChatStateStore } = vi.hoisted(() => ({
	resolveCloudChatStateStore: vi.fn(),
}));

const resolveCloudChatStateStoreMock = resolveCloudChatStateStore;

vi.mock("@vercel/sandbox", () => ({
	Sandbox: {
		create: sandboxCreate,
		get: sandboxGet,
	},
}));

vi.mock("../cloud-chat-store", () => ({
	resolveCloudChatStateStore: resolveCloudChatStateStoreMock,
}));

describe("agent-api /files", () => {
	beforeEach(() => {
		sandboxCreate.mockReset();
		sandboxGet.mockReset();
		resolveCloudChatStateStoreMock.mockReset();
	});

	it("streams file bytes from live sandbox", async () => {
		const storeState = {
			load: vi.fn(async () => ({
				chatId: "chat-live",
				sandboxId: "sb-live",
				updatedAt: 1_730_000_000,
			})),
			save: vi.fn(async () => undefined),
			delete: vi.fn(async () => undefined),
		} as const;
		resolveCloudChatStateStoreMock.mockResolvedValue(storeState);

		const readFileToBuffer = vi.fn(async () => Buffer.from("hello"));
		sandboxGet.mockResolvedValue({
			readFileToBuffer,
		});

		const { GET } = createAgentApi({
			basePath: "/agent-api",
			store: { adapter: "redis" },
			agent: {},
		});
		const response = await GET(
			new Request(
				"http://localhost/agent-api/files?chat_id=chat-live&path=%2E%2Fartifacts%2Freport.md",
			),
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(response.headers.get("Content-Disposition")).toBe(
			`inline; filename="report.md"`,
		);
		expect(body).toBe("hello");
		expect(sandboxGet).toHaveBeenCalledWith({ sandboxId: "sb-live" });
		expect(readFileToBuffer).toHaveBeenCalledWith({
			path: "./artifacts/report.md",
		});
	});

	it("recreates sandbox from snapshot when live sandbox is unavailable", async () => {
		const storeState = {
			load: vi.fn(async () => ({
				chatId: "chat-recovered",
				snapshotId: "snapshot-123",
				updatedAt: 1_730_000_000,
			})),
			save: vi.fn(async () => undefined),
			delete: vi.fn(async () => undefined),
		} as const;
		resolveCloudChatStateStoreMock.mockResolvedValue(storeState);
		sandboxGet.mockRejectedValue(new Error("expired"));

		const readFileToBuffer = vi.fn(async () => Buffer.from("fallback"));
		sandboxCreate.mockResolvedValue({
			readFileToBuffer,
		});

		const { GET } = createAgentApi({
			basePath: "/agent-api",
			store: { adapter: "redis" },
			agent: {},
		});
		const response = await GET(
			new Request(
				"http://localhost/agent-api/files?chat_id=chat-recovered&path=%2E%2Fartifacts%2Foutput.csv&download=1",
			),
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(sandboxCreate).toHaveBeenCalledWith({
			source: {
				type: "snapshot",
				snapshotId: "snapshot-123",
			},
		});
		expect(response.headers.get("Content-Type")).toBe(
			"text/csv; charset=utf-8",
		);
		expect(response.headers.get("Content-Disposition")).toBe(
			`attachment; filename="output.csv"`,
		);
		expect(body).toBe("fallback");
		expect(readFileToBuffer).toHaveBeenCalledWith({
			path: "./artifacts/output.csv",
		});
	});

	it("returns 404 when requested file is missing", async () => {
		const storeState = {
			load: vi.fn(async () => ({
				chatId: "chat-missing",
				sandboxId: "sb-missing",
				updatedAt: 1_730_000_000,
			})),
			save: vi.fn(async () => undefined),
			delete: vi.fn(async () => undefined),
		} as const;
		resolveCloudChatStateStoreMock.mockResolvedValue(storeState);
		sandboxGet.mockResolvedValue({
			readFileToBuffer: vi.fn(async () => undefined),
		});

		const { GET } = createAgentApi({
			basePath: "/agent-api",
			store: { adapter: "redis" },
			agent: {},
		});
		const response = await GET(
			new Request(
				"http://localhost/agent-api/files?chat_id=chat-missing&path=%2E%2Fartifacts%2Fmissing.txt",
			),
		);

		expect(response.status).toBe(404);
	});

	it("returns 400 when required query params are missing", async () => {
		const storeState = {
			load: vi.fn(async () => ({
				chatId: "chat-missing-params",
				sandboxId: "sb-missing-params",
				updatedAt: 1_730_000_000,
			})),
			save: vi.fn(async () => undefined),
			delete: vi.fn(async () => undefined),
		} as const;
		resolveCloudChatStateStoreMock.mockResolvedValue(storeState);

		const { GET } = createAgentApi({
			basePath: "/agent-api",
			store: { adapter: "redis" },
			agent: {},
		});
		const response = await GET(
			new Request(
				"http://localhost/agent-api/files?chat_id=chat-missing-params",
			),
		);

		expect(response.status).toBe(400);
	});
});
