import {
	createChatHandler,
	createGeminiAgent,
	createRelaySession,
	toRelayError,
} from "@giselles-ai/sandbox-agent-core";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const agentRunSchema = z.object({
	type: z.literal("agent.run"),
	message: z.string().min(1),
	document: z.string().optional(),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

type AgentRunInput = z.infer<typeof agentRunSchema>;
type RelaySession = Awaited<ReturnType<typeof createRelaySession>>;

class InvalidRunInputError extends Error {
	readonly detail: unknown;

	constructor(detail: unknown) {
		super("Invalid request payload.");
		this.name = "InvalidRunInputError";
		this.detail = detail;
	}
}

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

async function parseRunInput(request: Request): Promise<AgentRunInput> {
	const payload = await request.json().catch(() => null);
	const parsed = agentRunSchema.safeParse(payload);
	if (!parsed.success) {
		throw new InvalidRunInputError(parsed.error.flatten());
	}
	return parsed.data;
}

function resolveSnapshotId(_input: AgentRunInput, _request: Request): string {
	return requiredEnv("SANDBOX_SNAPSHOT_ID");
}

function resolveRelayUrl(request: Request): string {
	const configuredRelayUrl = process.env.BROWSER_TOOL_RELAY_URL?.trim();
	if (configuredRelayUrl) {
		return trimTrailingSlash(configuredRelayUrl);
	}

	return `${new URL(request.url).origin}/agent-api/relay`;
}

function createGeminiSandboxAgent(input: {
	snapshotId: string;
	relayUrl: string;
}) {
	return createGeminiAgent({
		snapshotId: input.snapshotId,
		tools: {
			browser: {
				relayUrl: input.relayUrl,
			},
		},
	});
}

function createGeminiRequest(input: {
	request: Request;
	runInput: AgentRunInput;
	session: RelaySession;
}): Request {
	const headers = new Headers(input.request.headers);
	headers.set("content-type", "application/json");

	const trimmedDocument = input.runInput.document?.trim();
	const message = trimmedDocument
		? `${input.runInput.message.trim()}\n\nDocument:\n${trimmedDocument}`
		: input.runInput.message.trim();

	return new Request(input.request.url, {
		method: "POST",
		headers,
		body: JSON.stringify({
			message,
			session_id: input.runInput.session_id,
			sandbox_id: input.runInput.sandbox_id,
			relay_session_id: input.session.sessionId,
			relay_token: input.session.token,
		}),
		signal: input.request.signal,
	});
}

function mergeRelaySessionStream(input: {
	chatResponse: Response;
	session: RelaySession;
	relayUrl: string;
}): Response {
	if (!input.chatResponse.body) {
		return input.chatResponse;
	}

	const encoder = new TextEncoder();
	const relaySessionEvent = `${JSON.stringify({
		type: "relay.session",
		sessionId: input.session.sessionId,
		token: input.session.token,
		expiresAt: input.session.expiresAt,
		relayUrl: input.relayUrl,
	})}\n`;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(relaySessionEvent));
			const reader = input.chatResponse.body?.getReader();
			if (!reader) {
				controller.close();
				return;
			}

			void (async () => {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}
						controller.enqueue(value);
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				} finally {
					reader.releaseLock();
				}
			})();
		},
	});

	const headers = new Headers(input.chatResponse.headers);
	headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
	headers.set("Cache-Control", "no-cache, no-transform");

	return new Response(stream, {
		status: input.chatResponse.status,
		statusText: input.chatResponse.statusText,
		headers,
	});
}

async function runAgentStreamResponse(input: {
	request: Request;
	agent: ReturnType<typeof createGeminiSandboxAgent>;
	runInput: AgentRunInput;
}): Promise<Response> {
	const session = await createRelaySession();
	const chatHandler = createChatHandler({ agent: input.agent });
	const relayUrl = resolveRelayUrl(input.request);
	const chatRequest = createGeminiRequest({
		request: input.request,
		runInput: input.runInput,
		session,
	});
	const chatResponse = await chatHandler(chatRequest);
	return mergeRelaySessionStream({
		chatResponse,
		session,
		relayUrl,
	});
}

export async function POST(request: Request): Promise<Response> {
	try {
		const input = await parseRunInput(request);
		const agent = createGeminiSandboxAgent({
			snapshotId: resolveSnapshotId(input, request),
			relayUrl: resolveRelayUrl(request),
		});

		return await runAgentStreamResponse({
			request,
			agent,
			runInput: input,
		});
	} catch (error) {
		if (error instanceof InvalidRunInputError) {
			return Response.json(
				{
					ok: false,
					errorCode: "INVALID_RESPONSE",
					message: error.message,
					error: error.detail,
				},
				{ status: 400 },
			);
		}

		const relayError = toRelayError(error);
		return Response.json(
			{ ok: false, errorCode: relayError.code, message: relayError.message },
			{ status: relayError.status },
		);
	}
}
