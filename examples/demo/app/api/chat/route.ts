import { type BrowserTools, browserTools } from "@giselles-ai/browser-tool";
import { giselle } from "@giselles-ai/giselle-provider";
import {
	consumeStream,
	convertToModelMessages,
	type InferUITools,
	streamText,
	type UIDataTypes,
	type UIMessage,
	validateUIMessages,
} from "ai";
import { agent } from "../../../lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
	id?: unknown;
	messages?: unknown;
	providerOptions?: unknown;
	trigger?: unknown;
	messageId?: unknown;
	[key: string]: unknown;
};

class InvalidChatRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidChatRequestError";
	}
}

type ChatUIMessage = UIMessage<never, UIDataTypes, InferUITools<BrowserTools>>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

async function parseChatRequestBody(
	request: Request,
): Promise<ChatRequestBody> {
	const payload = await request.json().catch(() => null);
	const body = asRecord(payload);
	if (!body) {
		throw new InvalidChatRequestError("Invalid request payload.");
	}
	if (!("messages" in body)) {
		throw new InvalidChatRequestError("Missing `messages` in request payload.");
	}
	return body as ChatRequestBody;
}

function resolveSessionId(body: ChatRequestBody): string {
	const providerOptions = asRecord(body.providerOptions);
	const giselleOptions = asRecord(providerOptions?.giselle);

	return (
		asNonEmptyString(giselleOptions?.sessionId) ??
		asNonEmptyString(body.id) ??
		crypto.randomUUID()
	);
}
async function parseChatMessages(
	body: ChatRequestBody,
): Promise<ChatUIMessage[]> {
	try {
		return await validateUIMessages<ChatUIMessage>({
			messages: body.messages,
			tools: browserTools,
		});
	} catch {
		throw new InvalidChatRequestError("Invalid `messages` payload.");
	}
}

function invalidRequestResponse(message: string): Response {
	return Response.json(
		{
			ok: false,
			errorCode: "INVALID_REQUEST",
			message,
		},
		{ status: 400 },
	);
}

function internalErrorResponse(): Response {
	return Response.json(
		{
			ok: false,
			errorCode: "INTERNAL_ERROR",
			message: "Failed to process chat request.",
		},
		{ status: 500 },
	);
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = await parseChatRequestBody(request);
		const messages = await parseChatMessages(body);
		const sessionId = resolveSessionId(body);

		const result = streamText({
			model: giselle({
				agent,
				baseUrl: process.env.GISELLE_AGENT_BASE_URL,
				apiKey: process.env.GISELLE_AGENT_API_KEY,
				headers: {
					"x-vercel-protection-bypass":
						process.env.EXTERNAL_AGENT_API_PROTECTION_BYPASS,
				},
			}),
			messages: await convertToModelMessages(messages),
			tools: browserTools,
			providerOptions: {
				giselle: {
					sessionId,
				},
			},
			abortSignal: request.signal,
		});

		return result.toUIMessageStreamResponse({
			headers: {
				"x-giselle-session-id": sessionId,
			},
			consumeSseStream: consumeStream,
		});
	} catch (error) {
		if (error instanceof InvalidChatRequestError) {
			return invalidRequestResponse(error.message);
		}

		console.error("POST /api/chat failed", error);
		return internalErrorResponse();
	}
}
