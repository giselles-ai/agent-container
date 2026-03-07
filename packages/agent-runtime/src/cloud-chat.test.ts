import type { RelayRequest } from "@giselles-ai/browser-tool";
import type { RelayRequestSubscription } from "@giselles-ai/browser-tool/relay";
import { describe, expect, it, vi } from "vitest";
import { runCloudChat } from "./cloud-chat";
import { getLiveCloudConnection } from "./cloud-chat-live";
import type {
	CloudChatRequest,
	CloudChatSessionState,
} from "./cloud-chat-state";

type TestRuntimeInput = CloudChatRequest & {
	session_id?: string;
	sandbox_id?: string;
	relay_session_id?: string;
	relay_token?: string;
};

function createStore() {
	const db = new Map<string, CloudChatSessionState | null>();
	const load = vi.fn(async (chatId: string) => db.get(chatId) ?? null);
	const save = vi.fn(async (state: CloudChatSessionState) => {
		db.set(state.chatId, { ...state });
	});
	const deleteChat = vi.fn(async (chatId: string) => {
		db.delete(chatId);
	});

	return {
		load,
		save,
		delete: deleteChat,
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

function neverResolveRelayRequest<T>(): Promise<T> {
	return new Promise<T>(() => {
		// Intentionally unresolved for tests where relay request should never arrive.
	});
}

function createRelaySubscriptionMock(
	requests: RelayRequest[] = [],
): RelayRequestSubscription {
	let index = 0;
	return {
		nextRequest: vi.fn(async (): Promise<RelayRequest> => {
			if (index >= requests.length) {
				return neverResolveRelayRequest<RelayRequest>();
			}

			const request = requests[index];
			index += 1;
			return request;
		}),
		close: vi.fn(async () => undefined),
	};
}

function createRelayRequestSubscriptionFactory(
	subscription: RelayRequestSubscription,
) {
	return vi.fn(
		async (_input: {
			sessionId: string;
			token: string;
		}): Promise<RelayRequestSubscription> => subscription,
	);
}

const dummyAgent = {} as never;

describe("runCloudChat", () => {
	it("starts a new chat when no stored state exists", async () => {
		const store = createStore();
		store.load.mockResolvedValueOnce(null);

		const runChatImpl = vi.fn(async (_input: unknown) =>
			createNdjsonResponse([
				`${JSON.stringify({
					type: "message",
					role: "assistant",
					content: "hi",
				})}\n`,
			]),
		);
		const createRelaySession = createRelaySessionFactory("relay-1", "token-1");
		const relaySubscription = createRelaySubscriptionMock();

		await runCloudChat({
			chatId: "chat-new",
			request: {
				message: "hello",
				chat_id: "chat-new",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession,
			runChatImpl,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(relaySubscription),
		});

		expect(runChatImpl).toHaveBeenCalledTimes(1);
		const runtimeInput = (
			runChatImpl.mock.calls[0]?.[0] as { input: TestRuntimeInput } | undefined
		)?.input;
		expect(runtimeInput).toMatchObject({
			message: "hello",
			relay_session_id: "relay-1",
			relay_token: "token-1",
		});
		expect(Object.hasOwn(runtimeInput ?? {}, "session_id")).toBe(false);
		expect(Object.hasOwn(runtimeInput ?? {}, "sandbox_id")).toBe(false);
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
		const runChatImpl = vi.fn(async (_input: unknown) =>
			createNdjsonResponse(["{}\n"]),
		);
		const createRelaySession = createRelaySessionFactory("relay-2", "token-2");
		const relaySubscription = createRelaySubscriptionMock();

		await runCloudChat({
			chatId: "chat-existing",
			request: {
				message: "hello",
				chat_id: "chat-existing",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession,
			runChatImpl,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(relaySubscription),
		});

		const runtimeInput = (
			runChatImpl.mock.calls[0]?.[0] as { input: TestRuntimeInput } | undefined
		)?.input;
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
		const relaySubscription = createRelaySubscriptionMock();

		const response = await runCloudChat({
			chatId: "chat-stream",
			request: {
				message: "hello",
				chat_id: "chat-stream",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession: createRelaySessionFactory("relay-3", "token-3"),
			runChatImpl,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(relaySubscription),
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
		const relaySubscription = createRelaySubscriptionMock();

		const response = await runCloudChat({
			chatId: "chat-save",
			request: {
				message: "hello",
				chat_id: "chat-save",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession,
			runChatImpl,
			now,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(relaySubscription),
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

	it("pauses on snapshot_request and persists pendingTool", async () => {
		const store = createStore();
		store.load.mockResolvedValueOnce(null);
		const runChatImpl = vi.fn(async () =>
			createNdjsonResponse([
				`${JSON.stringify({ type: "init", session_id: "agent-1" })}\n`,
				`${JSON.stringify({
					type: "snapshot_request",
					requestId: "tool-pause-1",
					instruction: "collect fields",
				})}\n`,
				`${JSON.stringify({
					type: "message",
					content: "should-not-appear",
				})}\n`,
			]),
		);
		const relaySubscription = createRelaySubscriptionMock();

		const response = await runCloudChat({
			chatId: "chat-pause",
			request: {
				message: "snapshot me",
				chat_id: "chat-pause",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession: createRelaySessionFactory(
				"relay-pause",
				"token-pause",
			),
			runChatImpl,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(relaySubscription),
		});

		const body = await response.text();
		const saved = store.get("chat-pause");
		const live = getLiveCloudConnection("chat-pause");

		expect(body).toContain('"type":"relay.session"');
		expect(body).toContain('"type":"init"');
		expect(body).toContain('"type":"snapshot_request"');
		expect(body).not.toContain('"should-not-appear"');
		expect(saved).toMatchObject({
			chatId: "chat-pause",
			agentSessionId: "agent-1",
			pendingTool: {
				requestId: "tool-pause-1",
				requestType: "snapshot_request",
				toolName: "getFormSnapshot",
			},
			relay: {
				sessionId: "relay-pause",
				token: "token-pause",
				url: "https://relay.example.com",
				expiresAt: 1_730_000_000,
			},
			updatedAt: expect.any(Number),
		});
		expect(live).toBeDefined();
	});

	it("uses hot live connection to resume after tool result", async () => {
		const store = createStore();
		const relaySubscription = createRelaySubscriptionMock();
		const runChatImpl = vi.fn(async () =>
			createNdjsonResponse(
				[
					`${JSON.stringify({ type: "init", session_id: "agent-hot" })}\n`,
					`${JSON.stringify({
						type: "snapshot_request",
						requestId: "tool-hot-1",
						instruction: "collect fields",
					})}\n`,
					`${JSON.stringify({
						type: "message",
						content: "continued-after-resume",
					})}\n`,
				],
				{ status: 201, headers: { "X-Flow": "hot" } },
			),
		);
		const sendRelayResponse = vi.fn(async () => undefined);

		const firstResponse = await runCloudChat({
			chatId: "chat-hot",
			request: {
				message: "snapshot me",
				chat_id: "chat-hot",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession: createRelaySessionFactory("relay-hot", "token-hot"),
			runChatImpl,
			sendRelayResponse,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(relaySubscription),
		});

		const firstBody = await firstResponse.text();
		expect(firstBody).toContain('"type":"snapshot_request"');
		expect(firstBody).not.toContain('"continued-after-resume"');

		const secondResponse = await runCloudChat({
			chatId: "chat-hot",
			request: {
				message: "resume",
				chat_id: "chat-hot",
				tool_results: [
					{
						toolCallId: "tool-hot-1",
						toolName: "getFormSnapshot",
						output: { fields: [{ fieldId: "title", currentValue: "foo" }] },
					},
				],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession: createRelaySessionFactory(
				"relay-hot-resumed",
				"token-hot-resumed",
			),
			runChatImpl: vi.fn(async () => {
				throw new Error("hot resume should not re-run chat");
			}),
			sendRelayResponse,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(relaySubscription),
		});

		const secondBody = await secondResponse.text();
		const saved = store.get("chat-hot");

		expect(secondResponse.status).toBe(201);
		expect(secondResponse.headers.get("X-Flow")).toBe("hot");
		expect(secondBody).toContain(
			'"type":"message","content":"continued-after-resume"',
		);
		expect(sendRelayResponse).toHaveBeenCalledWith({
			sessionId: "relay-hot",
			token: "token-hot",
			response: {
				type: "snapshot_response",
				requestId: "tool-hot-1",
				fields: [{ fieldId: "title", currentValue: "foo" }],
			},
		});
		expect(saved?.pendingTool).toBeNull();
		expect(getLiveCloudConnection("chat-hot")).toBeUndefined();
		expect(relaySubscription.close).toHaveBeenCalledTimes(1);
	});

	it("cold-resumes with stored agentSessionId and sandboxId when no live connection exists", async () => {
		const store = createStore();
		const createRelaySession = createRelaySessionFactory(
			"relay-cold",
			"token-cold",
		);
		store.load.mockResolvedValue({
			chatId: "chat-cold",
			agentSessionId: "agent-cold",
			sandboxId: "sandbox-cold",
			relay: {
				sessionId: "relay-existing",
				token: "token-existing",
				url: "https://relay.example.com",
				expiresAt: 1_730_000_100,
			},
			pendingTool: {
				requestId: "tool-cold-1",
				requestType: "execute_request",
				toolName: "executeFormActions",
			},
			updatedAt: 1_700_000_000,
		});
		const createRelaySub = createRelaySubscriptionMock();
		const sendRelayResponse = vi.fn(async () => undefined);
		const runChatImpl = vi.fn(async () =>
			createNdjsonResponse(
				[
					`${JSON.stringify({ type: "message", content: "cold resumed message" })}\n`,
				],
				{
					status: 201,
					headers: {
						"X-Flow": "cold",
					},
				},
			),
		);

		const response = await runCloudChat({
			chatId: "chat-cold",
			request: {
				message: "resume",
				chat_id: "chat-cold",
				tool_results: [
					{
						toolCallId: "tool-cold-1",
						toolName: "executeFormActions",
						output: { report: { applied: 1, skipped: 0, warnings: [] } },
					},
				],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession: createRelaySession,
			runChatImpl,
			sendRelayResponse,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(createRelaySub),
		});

		const body = await response.text();
		const saved = store.get("chat-cold");

		expect(response.status).toBe(201);
		expect(response.headers.get("X-Flow")).toBe("cold");
		expect(body).toContain('"type":"message","content":"cold resumed message"');
		expect(runChatImpl).toHaveBeenCalledWith({
			agent: dummyAgent,
			signal: expect.any(AbortSignal),
			input: {
				message: "resume",
				chat_id: "chat-cold",
				tool_results: [
					{
						toolCallId: "tool-cold-1",
						toolName: "executeFormActions",
						output: { report: { applied: 1, skipped: 0, warnings: [] } },
					},
				],
				session_id: "agent-cold",
				sandbox_id: "sandbox-cold",
				relay_session_id: "relay-cold-resume",
				relay_token: "token-cold-resume",
			},
		});
		expect(sendRelayResponse).toHaveBeenCalledWith({
			sessionId: "relay-existing",
			token: "token-existing",
			response: {
				type: "execute_response",
				requestId: "tool-cold-1",
				report: { applied: 1, skipped: 0, warnings: [] },
			},
		});
		expect(saved?.pendingTool).toBeNull();
	});

	it("errors when a matching tool result cannot be found", async () => {
		const store = createStore();
		const createRelaySession = createRelaySessionFactory(
			"relay-missing",
			"token-missing",
		);
		store.load.mockResolvedValue({
			chatId: "chat-missing",
			pendingTool: {
				requestId: "tool-missing-1",
				requestType: "snapshot_request",
				toolName: "getFormSnapshot",
			},
			relay: {
				sessionId: "relay-existing",
				token: "token-existing",
				url: "https://relay.example.com",
				expiresAt: 1_730_000_100,
			},
			updatedAt: 1_700_000_000,
		});
		const runChatImpl = vi.fn(async () => createNdjsonResponse(["{}\n"]));
		const sendRelayResponse = vi.fn(async () => undefined);

		await expect(
			runCloudChat({
				chatId: "chat-missing",
				request: {
					message: "resume",
					chat_id: "chat-missing",
					tool_results: [],
				},
				agent: dummyAgent,
				signal: new AbortController().signal,
				store,
				relayUrl: "https://relay.example.com",
				createRelaySession,
				runChatImpl,
				sendRelayResponse,
			}),
		).rejects.toThrow("Missing tool result for tool-missing-1");
		expect(runChatImpl).not.toHaveBeenCalled();
		expect(sendRelayResponse).not.toHaveBeenCalled();
	});

	it("preserves response headers and status for managed streams", async () => {
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
		const relaySubscription = createRelaySubscriptionMock();

		const response = await runCloudChat({
			chatId: "chat-headers",
			request: {
				message: "hello",
				chat_id: "chat-headers",
				tool_results: [],
			},
			agent: dummyAgent,
			signal: new AbortController().signal,
			store,
			relayUrl: "https://relay.example.com",
			createRelaySession: createRelaySessionFactory("relay-6", "token-6"),
			runChatImpl,
			createRelayRequestSubscription:
				createRelayRequestSubscriptionFactory(relaySubscription),
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
