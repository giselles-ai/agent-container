import { describe, expect, it, vi } from "vitest";
import { runCloudChat } from "./cloud-chat";
import type { CloudChatSessionState } from "./cloud-chat-state";

function createStore() {
	const db = new Map<string, CloudChatSessionState | null>();
	const load = vi.fn(async (chatId: string) => db.get(chatId) ?? null);
	const save = vi.fn(async (state: CloudChatSessionState) => {
		db.set(state.chatId, { ...state });
	});
	const del = vi.fn(async (chatId: string) => {
		db.delete(chatId);
	});

	return {
		load,
		save,
		del,
		get: (chatId: string) => db.get(chatId) ?? null,
	};
}

function createRelaySessionFactory(
	sessionId: string,
	token: string,
	expiresAt = 1_730_000_000,
) {
	return vi.fn(async () => ({
		sessionId,
		token,
		expiresAt,
	}));
}

function createNdjsonResponse(
	lines: string[],
	options?: {
		status?: number;
		headers?: Record<string, string>;
	},
): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(line));
			}
			controller.close();
		},
	});

	return new Response(stream, {
		status: options?.status,
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			...(options?.headers ?? {}),
		},
	});
}

const dummyAgent = {} as never;

describe("runCloudChat", () => {
	it("starts a new chat when no stored state exists", async () => {
		const store = createStore();
		store.load.mockResolvedValueOnce(null);

		const runChatImpl = vi.fn(async () =>
			createNdjsonResponse([
				`${JSON.stringify({
					type: "message",
					role: "assistant",
					content: "hi",
				})}\n`,
			]),
		);

		const createRelaySession = createRelaySessionFactory("relay-1", "token-1");

		await runCloudChat({
			chatId: "chat-new",
			request: {
				message: "hello",
				chat_id: "chat-new",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			deps: {
				store,
				relayUrl: "https://relay.example.com",
				createRelaySession,
				runChatImpl,
			},
		});

		expect(runChatImpl).toHaveBeenCalledTimes(1);
		const runtimeInput = runChatImpl.mock.calls[0][0]?.input;
		expect(runtimeInput).toMatchObject({
			message: "hello",
			relay_session_id: "relay-1",
			relay_token: "token-1",
		});
		expect(Object.hasOwn(runtimeInput, "session_id")).toBe(false);
		expect(Object.hasOwn(runtimeInput, "sandbox_id")).toBe(false);
		expect(store.load).toHaveBeenCalledWith("chat-new");
	});

	it("reuses stored agentSessionId and sandboxId for follow-up requests", async () => {
		const store = createStore();
		store.load.mockResolvedValueOnce({
			chatId: "chat-existing",
			agentSessionId: "session-1",
			sandboxId: "sandbox-1",
			updatedAt: 1_000,
		});
		const runChatImpl = vi.fn(async () => createNdjsonResponse(["{}\n"]));
		const createRelaySession = createRelaySessionFactory("relay-2", "token-2");

		await runCloudChat({
			chatId: "chat-existing",
			request: {
				message: "hello",
				chat_id: "chat-existing",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			deps: {
				store,
				relayUrl: "https://relay.example.com",
				createRelaySession,
				runChatImpl,
			},
		});

		const runtimeInput = runChatImpl.mock.calls[0][0]?.input;
		expect(runtimeInput).toMatchObject({
			session_id: "session-1",
			sandbox_id: "sandbox-1",
			relay_session_id: "relay-2",
			relay_token: "token-2",
		});
	});

	it("prepends relay.session before downstream NDJSON events", async () => {
		const store = createStore();
		store.load.mockResolvedValueOnce(null);

		const runChatImpl = vi.fn(async () =>
			createNdjsonResponse([
				`${JSON.stringify({ type: "init", session_id: "agent-session" })}\n`,
				`${JSON.stringify({
					type: "message",
					role: "assistant",
					content: "ok",
				})}\n`,
			]),
		);

		const response = await runCloudChat({
			chatId: "chat-stream",
			request: {
				message: "hello",
				chat_id: "chat-stream",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			deps: {
				store,
				relayUrl: "https://relay.example.com",
				createRelaySession: createRelaySessionFactory("relay-3", "token-3"),
				runChatImpl,
			},
		});

		const body = await response.text();
		const lines = body.split("\n").filter((line) => line.length > 0);

		expect(lines[0]).toContain('"type":"relay.session"');
		expect(lines[0]).toContain('"sessionId":"relay-3"');
		expect(lines[1]).toContain('"type":"init"');
		expect(lines[2]).toContain('"type":"message"');
	});

	it("persists init, sandbox, and relay events into the store", async () => {
		const store = createStore();
		store.load.mockResolvedValueOnce(null);
		const createRelaySession = createRelaySessionFactory(
			"relay-4",
			"token-4",
			1_730_000_300,
		);
		const now = vi.fn(() => 1_730_000_400);

		const runChatImpl = vi.fn(async () =>
			createNdjsonResponse([
				`${JSON.stringify({ type: "init", session_id: "agent-1" })}\n`,
				`${JSON.stringify({ type: "sandbox", sandbox_id: "sandbox-1" })}\n`,
				`${JSON.stringify({
					type: "relay.session",
					sessionId: "relay-event-session",
					token: "relay-event-token",
					relayUrl: "https://relay.example.com",
					expiresAt: 1_730_000_500,
				})}\n`,
			]),
		);

		const response = await runCloudChat({
			chatId: "chat-save",
			request: {
				message: "hello",
				chat_id: "chat-save",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			deps: {
				store,
				relayUrl: "https://relay.example.com",
				createRelaySession,
				runChatImpl,
				now,
			},
		});

		await response.text();
		const saved = store.get("chat-save");

		expect(saved).toEqual({
			chatId: "chat-save",
			agentSessionId: "agent-1",
			sandboxId: "sandbox-1",
			relay: {
				sessionId: "relay-event-session",
				token: "relay-event-token",
				url: "https://relay.example.com",
				expiresAt: 1_730_000_500,
			},
			updatedAt: 1_730_000_400,
		});
	});

	it("fails fast when a stored session still has pendingTool", async () => {
		const store = createStore();
		store.load.mockResolvedValueOnce({
			chatId: "chat-pending",
			pendingTool: {
				requestId: "tool-request-1",
				requestType: "snapshot_request",
				toolName: "getFormSnapshot",
			},
			updatedAt: 1,
		});
		const runChatImpl = vi.fn(async () => createNdjsonResponse(["{}\n"]));
		const createRelaySession = createRelaySessionFactory("relay-5", "token-5");

		await expect(
			runCloudChat({
				chatId: "chat-pending",
				request: {
					message: "resume",
					chat_id: "chat-pending",
					tool_results: [
						{
							toolCallId: "tool-request-1",
							toolName: "getFormSnapshot",
							output: { report: "ok" },
						},
					],
				},
				agent: dummyAgent,
				signal: new AbortController().signal,
				deps: {
					store,
					relayUrl: "https://relay.example.com",
					createRelaySession,
					runChatImpl,
				},
			}),
		).rejects.toThrow(
			"Chat chat-pending is paused on tool-request-1; tool resume lands in Phase 2.",
		);
		expect(runChatImpl).not.toHaveBeenCalled();
		expect(createRelaySession).not.toHaveBeenCalled();

		store.load.mockResolvedValueOnce({
			chatId: "chat-pending-2",
			pendingTool: {
				requestId: "tool-request-2",
				requestType: "snapshot_request",
				toolName: "getFormSnapshot",
			},
			updatedAt: 2,
		});

		await expect(
			runCloudChat({
				chatId: "chat-pending-2",
				request: {
					message: "resume",
					chat_id: "chat-pending-2",
				},
				agent: dummyAgent,
				signal: new AbortController().signal,
				deps: {
					store,
					relayUrl: "https://relay.example.com",
					createRelaySession,
					runChatImpl,
				},
			}),
		).rejects.toThrow(
			"Chat chat-pending-2 is paused on tool-request-2; tool resume lands in Phase 2.",
		);
		expect(createRelaySession).toHaveBeenCalledTimes(0);
	});

	it("preserves response headers and status for managed NDJSON stream", async () => {
		const store = createStore();
		store.load.mockResolvedValueOnce(null);
		const runChatImpl = vi.fn(async () =>
			createNdjsonResponse(
				[`${JSON.stringify({ type: "message", content: "done" })}\n`],
				{
					status: 201,
					headers: {
						"Cache-Control": "no-cache",
						"X-Test": "value-1",
					},
				},
			),
		);

		const response = await runCloudChat({
			chatId: "chat-headers",
			request: {
				message: "hello",
				chat_id: "chat-headers",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			deps: {
				store,
				relayUrl: "https://relay.example.com",
				createRelaySession: createRelaySessionFactory("relay-6", "token-6"),
				runChatImpl,
			},
		});

		const body = await response.text();
		expect(response.status).toBe(201);
		expect(response.headers.get("X-Test")).toBe("value-1");
		expect(response.headers.get("Cache-Control")).toBe("no-cache");
		expect(response.headers.get("Content-Type")).toBe(
			"application/x-ndjson; charset=utf-8",
		);
		expect(body).toContain('"type":"relay.session"');
	});
});
