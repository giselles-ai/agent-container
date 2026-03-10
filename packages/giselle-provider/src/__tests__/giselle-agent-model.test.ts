import type {
	LanguageModelV3CallOptions,
	LanguageModelV3Prompt,
	LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { GiselleAgentModel } from "../giselle-agent-model";

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
	releaseLock: ReturnType<typeof vi.fn>;
} {
	const encoder = new TextEncoder();
	const chunks = events.map((event) =>
		encoder.encode(`${JSON.stringify(event)}\n`),
	);
	let index = 0;
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
			cancel: async () => undefined,
			releaseLock,
		} as unknown as ReadableStreamDefaultReader<Uint8Array>,
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
	function createProvider() {
		const connectCloudApi = vi.fn(async () => ({
			reader: createNdjsonReader([
				{ type: "message", role: "assistant", content: "Done!", delta: true },
			]).reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			baseUrl: "https://studio.giselles.ai",
			agent: {
				agentType: "gemini",
				snapshotId: "snap_default",
			},
			deps: { connectCloudApi },
		});

		return { connectCloudApi, model };
	}

	it("posts chat_id and tool_results to Cloud", async () => {
		const { connectCloudApi, model } = createProvider();

		const result = await model.doStream(
			createCallOptions({
				sessionId: "chat-1",
				prompt: [
					...createPromptWithUser("Capture form"),
					{
						role: "tool",
						content: [
							{
								type: "tool-result",
								toolName: "getFormSnapshot",
								toolCallId: "tool-result-1",
								output: {
									type: "json",
									value: {
										fields: [{ name: "email" }],
									},
								},
							},
						],
					},
				],
			}),
		);
		const parts = await readAllParts(result.stream);

		expect(connectCloudApi).toHaveBeenCalledWith(
			expect.objectContaining({
				endpoint: "https://studio.giselles.ai/run",
				chatId: "chat-1",
				message: "Capture form",
				agentType: "gemini",
				snapshotId: "snap_default",
				toolResults: [
					{
						toolName: "getFormSnapshot",
						toolCallId: "tool-result-1",
						output: { fields: [{ name: "email" }] },
					},
				],
			}),
		);

		expect(parts.some((part) => part.type === "text-delta")).toBe(true);
		expect(
			parts.some(
				(part) => part.type === "response-metadata" && part.id === "chat-1",
			),
		).toBe(true);
	});

	it("does not require round-tripped sessionState for follow-up user messages", async () => {
		const { connectCloudApi, model } = createProvider();

		await readAllParts(
			(
				await model.doStream(
					createCallOptions({
						sessionId: "chat-1",
						prompt: createPromptWithUser("First message"),
					}),
				)
			).stream,
		);
		await readAllParts(
			(
				await model.doStream(
					createCallOptions({
						sessionId: "chat-1",
						prompt: createPromptWithUser("Second message"),
					}),
				)
			).stream,
		);

		expect(connectCloudApi).toHaveBeenCalledTimes(2);
		expect(connectCloudApi).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				chatId: "chat-1",
				message: "Second message",
				toolResults: [],
			}),
		);
	});

	it("streams snapshot_request and execute_request as tool calls without provider relay logic", async () => {
		const connectCloudApi = vi.fn(async () => ({
			reader: createNdjsonReader([
				{
					type: "snapshot_request",
					requestId: "snapshot-1",
					instruction: "Capture fields",
				},
				{
					type: "execute_request",
					requestId: "execute-1",
					report: { applied: 1 },
				},
			]).reader,
			response: new Response(null, { status: 200 }),
		}));

		const model = new GiselleAgentModel({
			baseUrl: "https://studio.giselles.ai",
			agent: {
				agentType: "gemini",
				snapshotId: "snap_tools",
			},
			deps: { connectCloudApi },
		});

		const result = await model.doStream(
			createCallOptions({
				sessionId: "chat-tools",
				prompt: createPromptWithUser("Run tool"),
			}),
		);
		const parts = await readAllParts(result.stream);

		expect(
			parts.some(
				(part) =>
					part.type === "tool-call" &&
					part.toolCallId === "snapshot-1" &&
					part.toolName === "getFormSnapshot",
			),
		).toBe(true);
		expect(
			parts.some(
				(part) =>
					part.type === "tool-call" &&
					part.toolCallId === "execute-1" &&
					part.toolName === "executeFormActions",
			),
		).toBe(true);
		expect(
			parts.some(
				(part) =>
					part.type === "finish" && part.finishReason.unified === "tool-calls",
			),
		).toBe(true);
	});

	it("does not emit raw session-state parts", async () => {
		const { connectCloudApi, model } = createProvider();

		const result = await model.doStream(
			createCallOptions({
				sessionId: "chat-no-state",
				prompt: createPromptWithUser("Simple follow-up"),
			}),
		);
		const parts = await readAllParts(result.stream);

		expect(
			parts.some(
				(part) =>
					part.type === "raw" &&
					part.rawValue &&
					typeof part.rawValue === "object",
			),
		).toBe(false);
		expect(connectCloudApi).toHaveBeenCalledTimes(1);
	});
});
