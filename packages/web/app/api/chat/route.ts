import {
	browserToolActionSchema,
	executionReportSchema,
	snapshotFieldSchema,
} from "@giselles-ai/browser-tool";
import { giselle } from "@giselles-ai/giselle-provider";
import {
	consumeStream,
	convertToModelMessages,
	type InferUITools,
	streamText,
	tool,
	type UIDataTypes,
	type UIMessage,
	validateUIMessages,
} from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLOUD_API_URL = "https://studio.giselles.ai";

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

const tools = {
	getFormSnapshot: tool({
		description: "Capture the current state of form fields on the page.",
		inputSchema: z.object({
			instruction: z
				.string()
				.describe("What to look for in the current form state."),
			document: z
				.string()
				.optional()
				.describe("Additional context to guide the snapshot."),
		}),
		outputSchema: z.object({
			fields: z.array(snapshotFieldSchema),
		}),
	}),
	executeFormActions: tool({
		description: "Execute fill, click, and select actions on form fields.",
		inputSchema: z.object({
			actions: z.array(browserToolActionSchema),
			fields: z.array(snapshotFieldSchema),
		}),
		outputSchema: z.object({
			report: executionReportSchema,
		}),
	}),
} as const;

type ChatUIMessage = UIMessage<never, UIDataTypes, InferUITools<typeof tools>>;

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function buildCloudApiHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		authorization: `Bearer ${requiredEnv("EXTERNAL_AGENT_API_BEARER_TOKEN")}`,
	};

	const bypass = process.env.EXTERNAL_AGENT_API_PROTECTION_BYPASS?.trim();
	if (bypass) {
		headers["x-vercel-protection-bypass"] = bypass;
	}

	return headers;
}

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

function mergeProviderOptions(
	body: ChatRequestBody,
	sessionId: string,
	// biome-ignore lint/suspicious/noExplicitAny: wip
): Record<string, any> {
	const providerOptions = asRecord(body.providerOptions) ?? {};
	const giselleOptions = asRecord(providerOptions.giselle) ?? {};

	return {
		...providerOptions,
		giselle: {
			...giselleOptions,
			sessionId,
		},
	};
}

async function parseChatMessages(
	body: ChatRequestBody,
): Promise<ChatUIMessage[]> {
	try {
		return await validateUIMessages<ChatUIMessage>({
			messages: body.messages,
			tools,
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
		const providerOptions = mergeProviderOptions(body, sessionId);

		const result = streamText({
			model: giselle({
				cloudApiUrl: CLOUD_API_URL,
				headers: buildCloudApiHeaders(),
			}),
			messages: await convertToModelMessages(messages),
			tools,
			providerOptions,
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
