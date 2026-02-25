import type {
	LanguageModelV3CallOptions,
	LanguageModelV3Prompt,
	LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GiselleAgentModel } from "../giselle-agent-model";
import type { LiveConnection, SessionMetadata } from "../types";

const sessionState = vi.hoisted(() => ({
	sessions: new Map<string, SessionMetadata>(),
	liveConnections: new Map<string, LiveConnection>(),
}));

vi.mock("../session-manager", () => ({
	createSession: async (metadata: SessionMetadata) => {
		sessionState.sessions.set(metadata.providerSessionId, metadata);
	},
	loadSession: async (providerSessionId: string) =>
		sessionState.sessions.get(providerSessionId) ?? null,
	updateSession: async (
		providerSessionId: string,
		updates: Partial<SessionMetadata>,
	) => {
		const existing = sessionState.sessions.get(providerSessionId) ?? {
			providerSessionId,
			createdAt: Date.now(),
		};
		sessionState.sessions.set(providerSessionId, {
			...existing,
			...updates,
		});
	},
	deleteSession: async (providerSessionId: string) => {
		sessionState.sessions.delete(providerSessionId);
		const connection = sessionState.liveConnections.get(providerSessionId);
		if (connection) {
			if (connection.relaySubscription) {
				await connection.relaySubscription.close().catch(() => undefined);
			}
			await connection.reader.cancel().catch(() => undefined);
			try {
				connection.reader.releaseLock();
			} catch {
				// ignore
			}
		}
		sessionState.liveConnections.delete(providerSessionId);
	},
	saveLiveConnection: (
		providerSessionId: string,
		connection: LiveConnection,
	) => {
		sessionState.liveConnections.set(providerSessionId, connection);
	},
	getLiveConnection: (providerSessionId: string) =>
		sessionState.liveConnections.get(providerSessionId),
	removeLiveConnection: async (providerSessionId: string) => {
		const connection = sessionState.liveConnections.get(providerSessionId);
		if (connection) {
			if (connection.relaySubscription) {
				await connection.relaySubscription.close().catch(() => undefined);
			}
			await connection.reader.cancel().catch(() => undefined);
			try {
				connection.reader.releaseLock();
			} catch {
				// ignore
			}
		}
		sessionState.liveConnections.delete(providerSessionId);
	},
}));

function createCallOptions(input: {
	prompt: LanguageModelV3Prompt;
	sessionId?: string;
}): LanguageModelV3CallOptions {
	return {
		prompt: input.prompt,
		providerOptions: input.sessionId
			? {
					giselle: {
						sessionId: input.sessionId,
					},
				}
			: undefined,
	};
}

function createPromptWithUser(text: string): LanguageModelV3Prompt {
	return [
		{
			role: "user",
			content: [{ type: "text", text }],
		},
	];
}

function createNdjsonReader(events: Array<Record<string, unknown>>): {
	reader: ReadableStreamDefaultReader<Uint8Array>;
	cancel: ReturnType<typeof vi.fn>;
	releaseLock: ReturnType<typeof vi.fn>;
} {
	const encoder = new TextEncoder();
	const chunks = events.map((event) =>
		encoder.encode(`${JSON.stringify(event)}\n`),
	);
	let index = 0;
	const cancel = vi.fn(async () => undefined);
	const releaseLock = vi.fn(() => undefined);

	return {
		reader: {
			read: async () => {
				if (index >= chunks.length) {
					return {
						done: true,
						value: undefined,
					};
				}

				const value = chunks[index];
				index += 1;
				return {
					done: false,
					value,
				};
			},
			cancel,
			releaseLock,
		} as unknown as ReadableStreamDefaultReader<Uint8Array>,
		cancel,
		releaseLock,
	};
}

async function readAllParts(
	stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<LanguageModelV3StreamPart[]> {
	const reader = stream.getReader();
	const parts: LanguageModelV3StreamPart[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		parts.push(value);
	}

	try {
		reader.releaseLock();
	} catch {
		// ignore
	}
	return parts;
}

describe("GiselleAgentModel", () => {
	beforeEach(() => {
		sessionState.sessions.clear();
		sessionState.liveConnections.clear();
	});

	it("streams a new text-only session and cleans up on finish(stop)", async () => {
		const cloudReader = createNdjsonReader([
			{ type: "init", session_id: "gem-1" },
			{ type: "message", role: "assistant", content: "Hello ", delta: true },
			{ type: "message", role: "assistant", content: "world!", delta: true },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("Fill login form"),
			}),
		);
		const providerSessionId =
			result.response?.headers?.["x-giselle-session-id"];
		const parts = await readAllParts(result.stream);

		expect(providerSessionId).toEqual(expect.any(String));
		expect(parts.some((part) => part.type === "text-start")).toBe(true);
		expect(
			parts.some(
				(part) => part.type === "text-delta" && part.delta === "Hello ",
			),
		).toBe(true);
		expect(
			parts.some(
				(part) => part.type === "text-delta" && part.delta === "world!",
			),
		).toBe(true);
		expect(
			parts.some(
				(part) =>
					part.type === "finish" && part.finishReason.unified === "stop",
			),
		).toBe(true);
		expect(connectCloudApi).toHaveBeenCalledTimes(1);
		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				endpoint: "https://studio.giselles.ai/agent-api/run",
				message: "Fill login form",
			}),
		);
		expect(sessionState.sessions.size).toBe(0);
		expect(sessionState.liveConnections.size).toBe(0);
	});

	it("passes agent type to cloud API", async () => {
		const cloudReader = createNdjsonReader([
			{ type: "init", session_id: "agent-type-1" },
			{ type: "message", role: "assistant", content: "Done", delta: false },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			agent: { type: "codex" },
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("hello"),
			}),
		);
		await readAllParts(result.stream);

		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				agentType: "codex",
				snapshotId: undefined,
			}),
		);
	});

	it("passes snapshot ID to cloud API", async () => {
		const cloudReader = createNdjsonReader([
			{ type: "init", session_id: "snapshot-id-1" },
			{ type: "message", role: "assistant", content: "Done", delta: false },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			agent: { snapshotId: "snap_custom_123" },
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("hello"),
			}),
		);
		await readAllParts(result.stream);

		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				agentType: undefined,
				snapshotId: "snap_custom_123",
			}),
		);
	});

	it("omits agent fields when no agent config is provided", async () => {
		const cloudReader = createNdjsonReader([
			{ type: "init", session_id: "snapshot-id-2" },
			{ type: "message", role: "assistant", content: "Done", delta: false },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("hello"),
			}),
		);
		await readAllParts(result.stream);

		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				agentType: undefined,
				snapshotId: undefined,
			}),
		);
	});

	it("passes both agent type and snapshot ID to cloud API", async () => {
		const cloudReader = createNdjsonReader([
			{ type: "init", session_id: "snapshot-id-3" },
			{ type: "message", role: "assistant", content: "Done", delta: false },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			agent: { type: "gemini", snapshotId: "snap_combo_1" },
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("hello"),
			}),
		);
		await readAllParts(result.stream);

		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				agentType: "gemini",
				snapshotId: "snap_combo_1",
			}),
		);
	});

	it("pauses on tool-call and keeps session + live connection", async () => {
		const cloudReader = createNdjsonReader([
			{ type: "init", session_id: "gem-2" },
			{
				type: "relay.session",
				sessionId: "relay-1",
				token: "relay-token-1",
				relayUrl: "https://relay.example",
			},
			{ type: "message", role: "assistant", content: "Filling ", delta: true },
			{
				type: "snapshot_request",
				requestId: "req-1",
				instruction: "Capture fields",
			},
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("Fill login form"),
			}),
		);
		const parts = await readAllParts(result.stream);

		expect(
			parts.some(
				(part) => part.type === "tool-call" && part.toolCallId === "req-1",
			),
		).toBe(true);
		expect(
			parts.some(
				(part) =>
					part.type === "finish" && part.finishReason.unified === "tool-calls",
			),
		).toBe(true);

		expect(sessionState.liveConnections.size).toBe(1);
		const [session] = Array.from(sessionState.sessions.values());
		expect(session.pendingRequestId).toBe("req-1");
		expect(session.relaySessionId).toBe("relay-1");
		expect(session.relayToken).toBe("relay-token-1");
		expect(session.relayUrl).toBe("https://relay.example");
	});

	it("resumes via hot path with pending tool result and cleans session", async () => {
		const sharedReader = createNdjsonReader([
			{ type: "init", session_id: "gem-3" },
			{
				type: "relay.session",
				sessionId: "relay-hot",
				token: "relay-hot-token",
				relayUrl: "https://relay.example",
			},
			{
				type: "snapshot_request",
				requestId: "req-hot",
				instruction: "Capture fields",
			},
			{ type: "message", role: "assistant", content: "Done!", delta: true },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: sharedReader.reader,
			response: new Response(null, { status: 200 }),
		}));
		const sendRelayResponse = vi.fn(async () => undefined);

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			deps: {
				connectCloudApi,
				sendRelayResponse,
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const firstResult = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("Fill login form"),
			}),
		);
		const firstSessionId =
			firstResult.response?.headers?.["x-giselle-session-id"];
		const firstParts = await readAllParts(firstResult.stream);

		expect(firstParts.some((part) => part.type === "tool-call")).toBe(true);
		expect(firstSessionId).toEqual(expect.any(String));

		const secondResult = await model.doStream(
			createCallOptions({
				sessionId: firstSessionId,
				prompt: [
					...createPromptWithUser("Fill login form"),
					{
						role: "tool",
						content: [
							{
								type: "tool-result",
								toolName: "getFormSnapshot",
								toolCallId: "req-hot",
								output: {
									type: "json",
									value: {
										fields: [{ fieldId: "email" }],
									},
								},
							},
						],
					},
				],
			}),
		);
		const secondParts = await readAllParts(secondResult.stream);

		expect(connectCloudApi).toHaveBeenCalledTimes(1);
		expect(sendRelayResponse).toHaveBeenCalledTimes(1);
		expect(sendRelayResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				response: {
					type: "snapshot_response",
					requestId: "req-hot",
					fields: [{ fieldId: "email" }],
				},
			}),
		);
		expect(
			secondParts.some(
				(part) => part.type === "text-delta" && part.delta === "Done!",
			),
		).toBe(true);
		expect(
			secondParts.some(
				(part) =>
					part.type === "finish" && part.finishReason.unified === "stop",
			),
		).toBe(true);
		expect(sessionState.sessions.size).toBe(0);
		expect(sessionState.liveConnections.size).toBe(0);
	});

	it("resumes via cold path when no live connection exists", async () => {
		sessionState.sessions.set("provider-cold", {
			providerSessionId: "provider-cold",
			createdAt: Date.now(),
			geminiSessionId: "gem-cold",
			sandboxId: "sandbox-cold",
			relaySessionId: "relay-cold",
			relayToken: "relay-cold-token",
			relayUrl: "https://relay.example",
			pendingRequestId: "req-cold",
		});

		const cloudReader = createNdjsonReader([
			{ type: "message", role: "assistant", content: "Completed", delta: true },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));
		const sendRelayResponse = vi.fn(async () => undefined);

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			deps: {
				connectCloudApi,
				sendRelayResponse,
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				sessionId: "provider-cold",
				prompt: [
					...createPromptWithUser("Fill login form"),
					{
						role: "tool",
						content: [
							{
								type: "tool-result",
								toolName: "executeFormActions",
								toolCallId: "req-cold",
								output: {
									type: "json",
									value: {
										report: {
											applied: 1,
											skipped: 0,
											warnings: [],
										},
									},
								},
							},
						],
					},
				],
			}),
		);
		const parts = await readAllParts(result.stream);

		expect(sendRelayResponse).toHaveBeenCalledTimes(1);
		expect(sendRelayResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				response: {
					type: "execute_response",
					requestId: "req-cold",
					report: {
						applied: 1,
						skipped: 0,
						warnings: [],
					},
				},
			}),
		);
		expect(connectCloudApi).toHaveBeenCalledTimes(1);
		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "gem-cold",
				sandboxId: "sandbox-cold",
			}),
		);
		expect(
			parts.some(
				(part) =>
					part.type === "finish" && part.finishReason.unified === "stop",
			),
		).toBe(true);
		expect(sessionState.sessions.size).toBe(0);
	});

	it("emits error when pending tool result is missing or mismatched", async () => {
		sessionState.sessions.set("provider-mismatch", {
			providerSessionId: "provider-mismatch",
			createdAt: Date.now(),
			relaySessionId: "relay-mismatch",
			relayToken: "relay-token",
			relayUrl: "https://relay.example",
			pendingRequestId: "req-expected",
		});

		const connectCloudApi = vi.fn(async () => {
			throw new Error("should not connect");
		});
		const sendRelayResponse = vi.fn(async () => undefined);

		const model = new GiselleAgentModel({
			cloudApiUrl: "https://studio.giselles.ai",
			deps: {
				connectCloudApi,
				sendRelayResponse,
				createRelaySubscription: vi.fn(() => ({
					nextRequest: async () => ({}),
					close: async () => {},
				})),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				sessionId: "provider-mismatch",
				prompt: [
					...createPromptWithUser("Fill login form"),
					{
						role: "tool",
						content: [
							{
								type: "tool-result",
								toolName: "getFormSnapshot",
								toolCallId: "req-other",
								output: {
									type: "json",
									value: {
										fields: [],
									},
								},
							},
						],
					},
				],
			}),
		);
		const parts = await readAllParts(result.stream);

		expect(sendRelayResponse).not.toHaveBeenCalled();
		expect(connectCloudApi).not.toHaveBeenCalled();
		expect(parts.some((part) => part.type === "error")).toBe(true);
		expect(sessionState.sessions.has("provider-mismatch")).toBe(true);
	});
});
