import {
	createRelaySession,
	toRelayError,
} from "@giselles-ai/browser-tool/relay";
import { createGeminiAgent, runChat } from "@giselles-ai/sandbox-agent";
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
type GeminiInput = {
	message: string;
	session_id?: string;
	sandbox_id?: string;
	relay_session_id: string;
	relay_token: string;
};

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

function resolveMessage(input: AgentRunInput): string {
	const trimmedMessage = input.message.trim();
	const trimmedDocument = input.document?.trim();

	return trimmedDocument
		? `${trimmedMessage}\n\nDocument:\n${trimmedDocument}`
		: trimmedMessage;
}

function resolveSnapshotId(): string {
	return requiredEnv("SANDBOX_SNAPSHOT_ID");
}

function resolveRelayUrl(request: Request): string {
	const configuredRelayUrl = process.env.BROWSER_TOOL_RELAY_URL?.trim();
	if (configuredRelayUrl) {
		return trimTrailingSlash(configuredRelayUrl);
	}
	return `${new URL(request.url).origin}/agent-api/relay`;
}

function resolveOidcToken(request: Request): string | undefined {
	const header = request.headers.get("x-vercel-oidc-token")?.trim();
	if (header) {
		return header;
	}

	const authorization = request.headers.get("authorization")?.trim();
	if (!authorization) {
		return undefined;
	}

	if (/^bearer\s+/i.test(authorization)) {
		return authorization.replace(/^bearer\s+/i, "").trim();
	}

	return authorization;
}

function createGeminiAgentEnv(input: {
	request: Request;
	relayUrl: string;
	relaySession: RelaySession;
}): Record<string, string> {
	const env: Record<string, string> = {
		GEMINI_API_KEY: requiredEnv("GEMINI_API_KEY"),
		BROWSER_TOOL_RELAY_URL: input.relayUrl,
		BROWSER_TOOL_RELAY_SESSION_ID: input.relaySession.sessionId,
		BROWSER_TOOL_RELAY_TOKEN: input.relaySession.token,
	};

	const oidcToken = resolveOidcToken(input.request);
	const fallbackOidcToken = process.env.VERCEL_OIDC_TOKEN?.trim();
	if (oidcToken) {
		env.VERCEL_OIDC_TOKEN = oidcToken;
	} else if (fallbackOidcToken) {
		env.VERCEL_OIDC_TOKEN = fallbackOidcToken;
	}

	const vercelProtectionBypass = process.env.VERCEL_PROTECTION_BYPASS?.trim();
	if (vercelProtectionBypass) {
		env.VERCEL_PROTECTION_BYPASS = vercelProtectionBypass;
	}

	const giselleProtectionPassword =
		process.env.GISELLE_PROTECTION_PASSWORD?.trim();
	if (giselleProtectionPassword) {
		env.GISELLE_PROTECTION_PASSWORD = giselleProtectionPassword;
	}

	return env;
}

function createGeminiSandboxAgent(input: {
	snapshotId: string;
	request: Request;
	relayUrl: string;
	relaySession: RelaySession;
}) {
	return createGeminiAgent({
		snapshotId: input.snapshotId,
		tools: {
			browser: {
				relayUrl: input.relayUrl,
			},
		},
		env: createGeminiAgentEnv({
			request: input.request,
			relayUrl: input.relayUrl,
			relaySession: input.relaySession,
		}),
	});
}

function buildGeminiInput(input: {
	runInput: AgentRunInput;
	session: RelaySession;
}): GeminiInput {
	return {
		message: resolveMessage(input.runInput),
		session_id: input.runInput.session_id,
		sandbox_id: input.runInput.sandbox_id,
		relay_session_id: input.session.sessionId,
		relay_token: input.session.token,
	};
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
	runInput: AgentRunInput;
}): Promise<Response> {
	const relayUrl = resolveRelayUrl(input.request);
	const session = await createRelaySession();

	const agent = createGeminiSandboxAgent({
		snapshotId: resolveSnapshotId(),
		request: input.request,
		relayUrl,
		relaySession: session,
	});

	const chatResponse = await runChat({
		agent,
		signal: input.request.signal,
		input: buildGeminiInput({
			runInput: input.runInput,
			session,
		}),
	});

	return mergeRelaySessionStream({
		chatResponse,
		session,
		relayUrl,
	});
}

export async function POST(request: Request): Promise<Response> {
	try {
		const input = await parseRunInput(request);
		return await runAgentStreamResponse({
			request,
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
			{
				ok: false,
				errorCode: relayError.code,
				message: relayError.message,
			},
			{ status: relayError.status },
		);
	}
}
