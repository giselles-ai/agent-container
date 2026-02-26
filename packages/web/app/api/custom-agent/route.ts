import { giselle } from "@giselles-ai/giselle-provider";
import { Agent } from "@giselles-ai/sandbox-agent";
import {
	consumeStream,
	convertToModelMessages,
	streamText,
	type UIMessage,
	validateUIMessages,
} from "ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLOUD_API_URL = "https://studio.giselles.ai";

type FileEntry = {
	path: string;
	content: string;
};

type CommandEntry = {
	cmd: string;
	args?: string[];
};

type CustomAgentRequestBody = {
	id?: unknown;
	messages?: unknown;
	providerOptions?: unknown;
	files?: FileEntry[];
	commands?: CommandEntry[];
};

class InvalidRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidRequestError";
	}
}

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

async function parseRequestBody(
	request: Request,
): Promise<CustomAgentRequestBody> {
	const payload = await request.json().catch(() => null);
	const body = asRecord(payload);
	if (!body) {
		throw new InvalidRequestError("Invalid request payload.");
	}
	if (!("messages" in body)) {
		throw new InvalidRequestError("Missing `messages` in request payload.");
	}
	return body as CustomAgentRequestBody;
}

async function parseMessages(
	body: CustomAgentRequestBody,
): Promise<UIMessage[]> {
	try {
		return await validateUIMessages({ messages: body.messages });
	} catch {
		throw new InvalidRequestError("Invalid `messages` payload.");
	}
}

function resolveSessionId(body: CustomAgentRequestBody): string {
	const providerOptions = asRecord(body.providerOptions);
	const giselleOptions = asRecord(providerOptions?.giselle);

	return (
		asNonEmptyString(giselleOptions?.sessionId) ??
		asNonEmptyString(body.id) ??
		crypto.randomUUID()
	);
}

function mergeProviderOptions(
	body: CustomAgentRequestBody,
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

function parseFiles(body: CustomAgentRequestBody): FileEntry[] {
	if (!Array.isArray(body.files)) {
		return [];
	}
	return body.files.filter(
		(f): f is FileEntry =>
			typeof f === "object" &&
			f !== null &&
			typeof f.path === "string" &&
			typeof f.content === "string",
	);
}

function parseCommands(body: CustomAgentRequestBody): CommandEntry[] {
	if (!Array.isArray(body.commands)) {
		return [];
	}
	return body.commands.filter(
		(c): c is CommandEntry =>
			typeof c === "object" && c !== null && typeof c.cmd === "string",
	);
}

function resolveAgent(
	body: CustomAgentRequestBody,
	files: FileEntry[],
	commands: CommandEntry[],
): Agent {
	const providerOptions = asRecord(body.providerOptions);
	const giselleOptions = asRecord(providerOptions?.giselle);
	const agentOptions = asRecord(giselleOptions?.agent);

	const typeRaw = asNonEmptyString(agentOptions?.type)?.toLowerCase();
	const type = typeRaw === "codex" || typeRaw === "gemini" ? typeRaw : "gemini";

	const snapshotId =
		asNonEmptyString(agentOptions?.snapshotId) ??
		asNonEmptyString(process.env.SANDBOX_SNAPSHOT_ID) ??
		requiredEnv("SANDBOX_SNAPSHOT_ID");

	const agent = Agent.create(type, { snapshotId });

	if (files.length > 0) {
		agent.addFiles(
			files.map((f) => ({ path: f.path, content: Buffer.from(f.content) })),
		);
	}

	if (commands.length > 0) {
		agent.runCommands(commands);
	}

	return agent;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = await parseRequestBody(request);
		const messages = await parseMessages(body);
		const sessionId = resolveSessionId(body);
		const providerOptions = mergeProviderOptions(body, sessionId);
		const files = parseFiles(body);
		const commands = parseCommands(body);
		const agent = resolveAgent(body, files, commands);

		const result = streamText({
			model: giselle({
				cloudApiUrl: CLOUD_API_URL,
				headers: buildCloudApiHeaders(),
				agent,
			}),
			messages: await convertToModelMessages(messages),
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
		if (error instanceof InvalidRequestError) {
			return Response.json(
				{ ok: false, errorCode: "INVALID_REQUEST", message: error.message },
				{ status: 400 },
			);
		}

		console.error("POST /api/custom-agent failed", error);
		return Response.json(
			{
				ok: false,
				errorCode: "INTERNAL_ERROR",
				message: "Failed to process request.",
			},
			{ status: 500 },
		);
	}
}
