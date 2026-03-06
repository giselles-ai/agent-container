import type {
	LanguageModelV3CallOptions,
	LanguageModelV3Prompt,
	LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GiselleAgentModel } from "../giselle-agent-model";
import { getGiselleSessionStateFromRawValue } from "../session-state";
import { getLiveConnection } from "../session-manager";
import type {
	GiselleSessionState,
	LiveConnection,
	RelaySubscription,
} from "../types";

function createCallOptions(input: {
	prompt: LanguageModelV3Prompt;
	sessionId?: string;
	sessionState?: GiselleSessionState;
}): LanguageModelV3CallOptions {
	return {
		prompt: input.prompt,
		providerOptions:
			input.sessionId || input.sessionState
				? {
						giselle: {
							...(input.sessionId ? { sessionId: input.sessionId } : {}),
							...(input.sessionState
								? { sessionState: input.sessionState }
								: {}),
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

function createRelaySubscriptionMock(): {
	subscription: RelaySubscription;
	nextRequest: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
} {
	let rejectWaiter: ((error: Error) => void) | null = null;
	const nextRequest = vi.fn(
		() =>
			new Promise<Record<string, unknown>>((_, reject) => {
				rejectWaiter = reject;
			}),
	);
	const close = vi.fn(async () => {
		rejectWaiter?.(new Error("closed"));
		rejectWaiter = null;
	});

	return {
		subscription: {
			nextRequest,
			close,
		},
		nextRequest,
		close,
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

function extractSessionStates(
	parts: LanguageModelV3StreamPart[],
): GiselleSessionState[] {
	return parts.flatMap((part) => {
		if (part.type !== "raw") {
			return [];
		}

		const sessionState = getGiselleSessionStateFromRawValue(part.rawValue);
		return sessionState ? [sessionState] : [];
	});
}

function createAgent(
	type: "gemini" | "codex" = "gemini",
	snapshotId = "snap_default",
): { agentType: "gemini" | "codex"; snapshotId: string } {
	return {
		agentType: type,
		snapshotId,
	};
}

describe("GiselleAgentModel", () => {
	beforeEach(() => {
		delete globalThis.__giselleProviderSessions;
	});

	it("streams a text session and emits session state updates", async () => {
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
			baseUrl: "https://studio.giselles.ai",
			agent: createAgent("gemini", "snap_default_1"),
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(),
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
		const sessionStates = extractSessionStates(parts);

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
		expect(sessionStates.at(-1)).toMatchObject({
			geminiSessionId: "gem-1",
			pendingRequestId: null,
		});
		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				endpoint: "https://studio.giselles.ai",
				message: "Fill login form",
				agentType: "gemini",
				snapshotId: "snap_default_1",
			}),
		);
		expect(getLiveConnection(providerSessionId as string)).toBeUndefined();
	});

	it("uses round-tripped session state for follow-up requests", async () => {
		const cloudReader = createNdjsonReader([
			{ type: "message", role: "assistant", content: "Follow-up", delta: false },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			baseUrl: "https://studio.giselles.ai",
			agent: createAgent("codex", "snap_follow_up"),
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(),
			},
		});

		await readAllParts(
			(
				await model.doStream(
					createCallOptions({
						sessionId: "provider-follow-up",
						sessionState: {
							geminiSessionId: "gem-follow-up",
							sandboxId: "sandbox-follow-up",
						},
						prompt: createPromptWithUser("Continue"),
					}),
				)
			).stream,
		);

		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "gem-follow-up",
				sandboxId: "sandbox-follow-up",
				agentType: "codex",
				snapshotId: "snap_follow_up",
			}),
		);
	});

	it("pauses on tool calls and keeps an in-memory live connection", async () => {
		const relaySubscription = createRelaySubscriptionMock();
		const cloudReader = createNdjsonReader([
			{ type: "init", session_id: "gem-2" },
			{
				type: "relay.session",
				sessionId: "relay-1",
				token: "relay-token-1",
				relayUrl: "https://relay.example",
			},
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
			baseUrl: "https://studio.giselles.ai",
			agent: createAgent("gemini", "snap_tool_pause"),
			deps: {
				connectCloudApi,
				sendRelayResponse: vi.fn(async () => undefined),
				createRelaySubscription: vi.fn(() => relaySubscription.subscription),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("Fill login form"),
			}),
		);
		const providerSessionId =
			result.response?.headers?.["x-giselle-session-id"] as string;
		const parts = await readAllParts(result.stream);
		const sessionStates = extractSessionStates(parts);

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
		expect(sessionStates.at(-1)).toMatchObject({
			geminiSessionId: "gem-2",
			relaySessionId: "relay-1",
			relayToken: "relay-token-1",
			relayUrl: "https://relay.example",
			pendingRequestId: "req-1",
		});
		expect(getLiveConnection(providerSessionId)).toBeDefined();
	});

	it("resumes via hot path using the client round-tripped session state", async () => {
		const relaySubscription = createRelaySubscriptionMock();
		const sharedReader = createNdjsonReader([
			{ type: "init", session_id: "gem-hot" },
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
			baseUrl: "https://studio.giselles.ai",
			agent: createAgent("gemini", "snap_hot"),
			deps: {
				connectCloudApi,
				sendRelayResponse,
				createRelaySubscription: vi.fn(() => relaySubscription.subscription),
			},
		});

		const firstResult = await model.doStream(
			createCallOptions({
				prompt: createPromptWithUser("Fill login form"),
			}),
		);
		const providerSessionId =
			firstResult.response?.headers?.["x-giselle-session-id"] as string;
		const firstParts = await readAllParts(firstResult.stream);
		const sessionState = extractSessionStates(firstParts).at(-1);

		expect(sessionState).toBeDefined();
		expect(getLiveConnection(providerSessionId)).toBeDefined();

		const secondResult = await model.doStream(
			createCallOptions({
				sessionId: providerSessionId,
				sessionState,
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
		const secondSessionStates = extractSessionStates(secondParts);

		expect(connectCloudApi).toHaveBeenCalledTimes(1);
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
		expect(secondSessionStates[0]).toMatchObject({
			pendingRequestId: null,
		});
		expect(getLiveConnection(providerSessionId)).toBeUndefined();
	});

	it("resumes via cold path when only client session state remains", async () => {
		const cloudReader = createNdjsonReader([
			{ type: "message", role: "assistant", content: "Completed", delta: true },
		]);
		const connectCloudApi = vi.fn(async () => ({
			reader: cloudReader.reader,
			response: new Response(null, { status: 200 }),
		}));
		const sendRelayResponse = vi.fn(async () => undefined);

		const model = new GiselleAgentModel({
			baseUrl: "https://studio.giselles.ai",
			agent: createAgent("gemini", "snap_cold"),
			deps: {
				connectCloudApi,
				sendRelayResponse,
				createRelaySubscription: vi.fn(),
			},
		});

		const sessionState: GiselleSessionState = {
			geminiSessionId: "gem-cold",
			sandboxId: "sandbox-cold",
			relaySessionId: "relay-cold",
			relayToken: "relay-cold-token",
			relayUrl: "https://relay.example",
			pendingRequestId: "req-cold",
		};

		const result = await model.doStream(
			createCallOptions({
				sessionId: "provider-cold",
				sessionState,
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
	});

	it("emits an error when the pending tool result does not match session state", async () => {
		const connectCloudApi = vi.fn(async () => {
			throw new Error("should not connect");
		});
		const sendRelayResponse = vi.fn(async () => undefined);

		const model = new GiselleAgentModel({
			baseUrl: "https://studio.giselles.ai",
			agent: createAgent("gemini", "snap_error"),
			deps: {
				connectCloudApi,
				sendRelayResponse,
				createRelaySubscription: vi.fn(),
			},
		});

		const result = await model.doStream(
			createCallOptions({
				sessionId: "provider-mismatch",
				sessionState: {
					relaySessionId: "relay-mismatch",
					relayToken: "relay-token",
					relayUrl: "https://relay.example",
					pendingRequestId: "req-expected",
				},
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
	});
});
