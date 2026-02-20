import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ChatAgent } from "./chat-handler";
import {
	createAgentRunHandler,
	createGeminiRunHandler,
	type AgentRunPayload,
} from "./run-handler";

const {
	createChatHandlerMock,
	createGeminiAgentMock,
	createRelaySessionMock,
	toRelayErrorMock,
} = vi.hoisted(() => ({
	createChatHandlerMock: vi.fn(),
	createGeminiAgentMock: vi.fn(),
	createRelaySessionMock: vi.fn(),
	toRelayErrorMock: vi.fn(),
}));

vi.mock("./chat-handler", () => ({
	createChatHandler: createChatHandlerMock,
}));

vi.mock("./agents/gemini-agent", () => ({
	createGeminiAgent: createGeminiAgentMock,
}));

vi.mock("./relay-store", () => ({
	createRelaySession: createRelaySessionMock,
	toRelayError: toRelayErrorMock,
}));

const originalEnv = { ...process.env };

function createPayloadSchema(): z.ZodType<AgentRunPayload> {
	return z.object({
		type: z.literal("agent.run"),
		message: z.string().min(1),
		document: z.string().optional(),
		session_id: z.string().min(1).optional(),
		sandbox_id: z.string().min(1).optional(),
	});
}

function createPostRequest(input: {
	payload: unknown;
	url?: string;
	headers?: Record<string, string>;
}): Request {
	return new Request(input.url ?? "https://example.com/agent-api/run", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...input.headers,
		},
		body: JSON.stringify(input.payload),
	});
}

function createStreamResponse(line: string): Response {
	return new Response(`${line}\n`, {
		headers: {
			"content-type": "application/x-ndjson; charset=utf-8",
		},
	});
}

function parseNdjsonLines(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

describe("createAgentRunHandler", () => {
	beforeEach(() => {
		createChatHandlerMock.mockReset();
		createGeminiAgentMock.mockReset();
		createRelaySessionMock.mockReset();
		toRelayErrorMock.mockReset();

		createRelaySessionMock.mockResolvedValue({
			sessionId: "relay-session",
			token: "relay-token",
			expiresAt: 123_456,
		});
		createChatHandlerMock.mockImplementation(
			() => async () =>
				createStreamResponse(
					JSON.stringify({ type: "message", role: "assistant", content: "ok" }),
				),
		);
		toRelayErrorMock.mockImplementation((error: unknown) => ({
			code: "INTERNAL",
			status: 500,
			message: error instanceof Error ? error.message : String(error),
		}));
	});

	afterEach(() => {
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnv)) {
				delete process.env[key];
			}
		}
		for (const [key, value] of Object.entries(originalEnv)) {
			process.env[key] = value;
		}
	});

	it("returns 400 JSON when payload is invalid", async () => {
		const handler = createAgentRunHandler({
			payloadSchema: createPayloadSchema(),
			createAgent: () => ({} as ChatAgent<{ message: string }>),
			mapToChatPayload: () => ({ message: "unused" }),
		});

		const response = await handler.POST(
			createPostRequest({
				payload: { type: "agent.run" },
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			ok: false,
			errorCode: "INVALID_RESPONSE",
			message: "Invalid request payload.",
		});
		expect(createRelaySessionMock).not.toHaveBeenCalled();
		expect(createChatHandlerMock).not.toHaveBeenCalled();
	});

	it("uses BROWSER_TOOL_RELAY_URL with trailing slash trimmed and prepends relay.session", async () => {
		process.env.BROWSER_TOOL_RELAY_URL =
			"https://relay.example.com/agent-api/relay///";

		let capturedRelayUrl = "";
		let capturedChatPayload: unknown = null;
		createChatHandlerMock.mockImplementationOnce(
			() => async (request: Request) => {
				capturedChatPayload = await request.json();
				return createStreamResponse(
					JSON.stringify({
						type: "message",
						role: "assistant",
						content: "hello",
					}),
				);
			},
		);

		const handler = createAgentRunHandler({
			payloadSchema: createPayloadSchema(),
			createAgent: ({ relayUrl }) => {
				capturedRelayUrl = relayUrl;
				return {} as ChatAgent<{ message: string }>;
			},
			mapToChatPayload: ({ payload }) => ({ message: payload.message }),
		});

		const response = await handler.POST(
			createPostRequest({
				payload: {
					type: "agent.run",
					message: "hello",
				},
			}),
		);
		const lines = parseNdjsonLines(await response.text());

		expect(capturedRelayUrl).toBe("https://relay.example.com/agent-api/relay");
		expect(capturedChatPayload).toEqual({ message: "hello" });
		expect(JSON.parse(lines[0] ?? "")).toEqual({
			type: "relay.session",
			sessionId: "relay-session",
			token: "relay-token",
			expiresAt: 123_456,
			relayUrl: "https://relay.example.com/agent-api/relay",
		});
		expect(JSON.parse(lines[1] ?? "")).toEqual({
			type: "message",
			role: "assistant",
			content: "hello",
		});
	});

	it("falls back to request origin relay URL when env is unset", async () => {
		delete process.env.BROWSER_TOOL_RELAY_URL;

		let capturedRelayUrl = "";
		const handler = createAgentRunHandler({
			payloadSchema: createPayloadSchema(),
			createAgent: ({ relayUrl }) => {
				capturedRelayUrl = relayUrl;
				return {} as ChatAgent<{ message: string }>;
			},
			mapToChatPayload: ({ payload }) => ({ message: payload.message }),
		});

		const response = await handler.POST(
			createPostRequest({
				url: "https://studio.example.com/agent-api/run",
				payload: {
					type: "agent.run",
					message: "hello",
				},
			}),
		);
		const lines = parseNdjsonLines(await response.text());
		const relaySessionEvent = JSON.parse(lines[0] ?? "");

		expect(capturedRelayUrl).toBe("https://studio.example.com/agent-api/relay");
		expect(relaySessionEvent.relayUrl).toBe(
			"https://studio.example.com/agent-api/relay",
		);
	});

	it("maps thrown errors through toRelayError", async () => {
		const thrownError = new Error("relay session failed");
		createRelaySessionMock.mockRejectedValueOnce(thrownError);
		toRelayErrorMock.mockReturnValueOnce({
			code: "TIMEOUT",
			status: 504,
			message: "relay timeout",
		});

		const handler = createAgentRunHandler({
			payloadSchema: createPayloadSchema(),
			createAgent: () => ({} as ChatAgent<{ message: string }>),
			mapToChatPayload: ({ payload }) => ({ message: payload.message }),
		});

		const response = await handler.POST(
			createPostRequest({
				payload: {
					type: "agent.run",
					message: "hello",
				},
			}),
		);

		expect(toRelayErrorMock).toHaveBeenCalledWith(thrownError);
		expect(response.status).toBe(504);
		expect(await response.json()).toEqual({
			ok: false,
			errorCode: "TIMEOUT",
			message: "relay timeout",
		});
	});
});

describe("createGeminiRunHandler", () => {
	beforeEach(() => {
		createChatHandlerMock.mockReset();
		createGeminiAgentMock.mockReset();
		createRelaySessionMock.mockReset();
		toRelayErrorMock.mockReset();

		createRelaySessionMock.mockResolvedValue({
			sessionId: "relay-session",
			token: "relay-token",
			expiresAt: 1_001,
		});
		createGeminiAgentMock.mockReturnValue(
			{} as ChatAgent<{
				message: string;
				relay_session_id: string;
				relay_token: string;
			}>,
		);
		createChatHandlerMock.mockImplementation(
			() => async () => createStreamResponse(JSON.stringify({ type: "message" })),
		);
		toRelayErrorMock.mockImplementation((error: unknown) => ({
			code: "INTERNAL",
			status: 500,
			message: error instanceof Error ? error.message : String(error),
		}));
	});

	afterEach(() => {
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnv)) {
				delete process.env[key];
			}
		}
		for (const [key, value] of Object.entries(originalEnv)) {
			process.env[key] = value;
		}
	});

	it("creates gemini request payload with document and relay credentials", async () => {
		let capturedPayload: unknown = null;
		let capturedAuthorization = "";
		createChatHandlerMock.mockImplementationOnce(
			() => async (request: Request) => {
				capturedPayload = await request.json();
				capturedAuthorization = request.headers.get("authorization") ?? "";
				return createStreamResponse(JSON.stringify({ type: "message" }));
			},
		);

		const handler = createGeminiRunHandler({
			snapshotId: "snapshot-fixed",
			relayUrl: "https://relay.custom.example/agent-api/relay///",
		});

		const response = await handler.POST(
			createPostRequest({
				url: "https://web.example.com/agent-api/run",
				headers: {
					authorization: "Bearer planner-token",
				},
				payload: {
					type: "agent.run",
					message: "  Fill the form  ",
					document: "  Summary text.  ",
					session_id: "gemini-session",
					sandbox_id: "sandbox-id",
				},
			}),
		);
		const lines = parseNdjsonLines(await response.text());

		expect(createGeminiAgentMock).toHaveBeenCalledWith({
			snapshotId: "snapshot-fixed",
			tools: {
				browser: {
					relayUrl: "https://relay.custom.example/agent-api/relay",
				},
			},
		});
		expect(capturedAuthorization).toBe("Bearer planner-token");
		expect(capturedPayload).toEqual({
			message: "Fill the form\n\nDocument:\nSummary text.",
			session_id: "gemini-session",
			sandbox_id: "sandbox-id",
			relay_session_id: "relay-session",
			relay_token: "relay-token",
		});
		expect(JSON.parse(lines[0] ?? "")).toMatchObject({
			type: "relay.session",
			relayUrl: "https://relay.custom.example/agent-api/relay",
		});
	});
});
