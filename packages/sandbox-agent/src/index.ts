import { z } from "zod";

const DEFAULT_ENDPOINT = "https://studio.giselles.ai/agent-api";
const DEBUG_ENABLED =
	process.env.GISELLE_AGENT_DEBUG === "true" || process.env.DEBUG === "1";

type DebugContext = {
	baseUrl?: string;
};

function debugLog(context: DebugContext, message: string): void {
	if (!DEBUG_ENABLED) {
		return;
	}

	console.info("[agent-runner]", JSON.stringify({ ...context, message }));
}

const agentRunSchema = z.object({
	type: z.literal("agent.run"),
	message: z.string().min(1),
	document: z.string().optional(),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

function invalidRequestResponse(detail: unknown): Response {
	return Response.json(
		{
			ok: false,
			errorCode: "INVALID_REQUEST",
			message: "Invalid request payload.",
			error: detail,
		},
		{ status: 400 },
	);
}

function invalidConfigResponse(message: string): Response {
	return Response.json(
		{
			ok: false,
			errorCode: "INVALID_CONFIG",
			message,
		},
		{ status: 500 },
	);
}

function badGatewayResponse(message: string): Response {
	return Response.json(
		{
			ok: false,
			errorCode: "UPSTREAM_UNAVAILABLE",
			message,
		},
		{ status: 502 },
	);
}

function resolveApiKey(input?: AgentRunnerOptions): string {
	return (
		input?.apiKey?.trim() ||
		process.env.GISELLE_SANDBOX_AGENT_API_KEY?.trim() ||
		process.env.GISELLE_API_KEY?.trim() ||
		""
	);
}

function parseAbsoluteEndpoint(baseUrl: string): string | null {
	try {
		const url = new URL(baseUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		return url.toString();
	} catch {
		return null;
	}
}

type EndpointResolutionResult =
	| { ok: true; endpoint: string }
	| { ok: false; message: string };

function resolveEndpoint(input: {
	baseUrl?: string;
}): EndpointResolutionResult {
	const baseUrl = input.baseUrl?.trim();
	if (baseUrl) {
		const endpoint = parseAbsoluteEndpoint(baseUrl);
		if (!endpoint) {
			return {
				ok: false,
				message:
					"`baseUrl` must be an absolute HTTP(S) endpoint URL, e.g. https://studio.giselles.ai/agent-api.",
			};
		}
		debugLog(
			{
				baseUrl: input.baseUrl,
			},
			`resolveEndpoint: using baseUrl -> ${endpoint}`,
		);
		return { ok: true, endpoint };
	}

	debugLog(
		{
			baseUrl: input.baseUrl,
		},
		`resolveEndpoint: using default -> ${DEFAULT_ENDPOINT}`,
	);

	return { ok: true, endpoint: DEFAULT_ENDPOINT };
}

export type AgentRunnerOptions = {
	apiKey?: string;
	baseUrl?: string;
};

export type AgentRunnerHandler = {
	POST: (request: Request) => Promise<Response>;
};

export function handleAgentRunner(
	options?: AgentRunnerOptions,
): AgentRunnerHandler {
	const apiKey = resolveApiKey(options);
	const optionSnapshot = {
		baseUrl: options?.baseUrl?.trim(),
		hasApiKey: Boolean(apiKey),
		hasInlineApiKey: Boolean(options?.apiKey?.trim()),
		hasEnvApiKey:
			Boolean(process.env.GISELLE_SANDBOX_AGENT_API_KEY?.trim()) ||
			Boolean(process.env.GISELLE_API_KEY?.trim()),
	};

	debugLog(
		optionSnapshot,
		`handleAgentRunner initialized (${options ? "custom options" : "default options"})`,
	);

	return {
		POST: async (request: Request): Promise<Response> => {
			debugLog(
				{
					baseUrl: optionSnapshot.baseUrl,
				},
				`POST request start: host=${new URL(request.url).host}`,
			);
			const payload = await request.json().catch(() => null);
			const parsed = agentRunSchema.safeParse(payload);

			if (!parsed.success) {
				debugLog(
					{
						baseUrl: optionSnapshot.baseUrl,
					},
					`payload invalid: ${parsed.error.issues.length} issues`,
				);
				return invalidRequestResponse(parsed.error.flatten());
			}

			const endpointResult = resolveEndpoint({
				baseUrl: options?.baseUrl,
			});
			if (!endpointResult.ok) {
				debugLog(
					{
						baseUrl: optionSnapshot.baseUrl,
					},
					`invalid endpoint config: ${endpointResult.message}`,
				);
				return invalidConfigResponse(endpointResult.message);
			}
			debugLog(
				{
					baseUrl: optionSnapshot.baseUrl,
				},
				`POST forwarding to endpoint: ${endpointResult.endpoint}`,
			);

			const headers: Record<string, string> = {
				"content-type": "application/json",
			};
			if (apiKey) {
				headers.authorization = `Bearer ${apiKey}`;
				debugLog(
					{
						baseUrl: optionSnapshot.baseUrl,
					},
					"Authorization header attached",
				);
			} else {
				debugLog(
					{
						baseUrl: optionSnapshot.baseUrl,
					},
					"Authorization header skipped (apiKey missing)",
				);
			}

			let upstreamResponse: Response;
			try {
				upstreamResponse = await fetch(endpointResult.endpoint, {
					method: "POST",
					headers,
					body: JSON.stringify(parsed.data),
					signal: request.signal,
				});
			} catch (error) {
				debugLog(
					{
						baseUrl: optionSnapshot.baseUrl,
					},
					`upstream fetch failed: ${error instanceof Error ? error.message : String(error)}`,
				);
				const message =
					error instanceof Error
						? error.message
						: "Failed to connect to upstream API.";
				return badGatewayResponse(message);
			}
			debugLog(
				{
					baseUrl: optionSnapshot.baseUrl,
				},
				`upstream responded: status=${upstreamResponse.status}, content-type=${upstreamResponse.headers.get("content-type") ?? "(none)"}, content-encoding=${upstreamResponse.headers.get("content-encoding") ?? "(none)"}`,
			);

			const responseHeaders = new Headers(upstreamResponse.headers);
			responseHeaders.delete("content-encoding");
			responseHeaders.delete("Content-Encoding");
			responseHeaders.delete("content-length");
			responseHeaders.delete("transfer-encoding");
			responseHeaders.set(
				"Content-Type",
				responseHeaders.get("Content-Type") ??
					"application/x-ndjson; charset=utf-8",
			);
			responseHeaders.set("Cache-Control", "no-cache, no-transform");

			return new Response(upstreamResponse.body, {
				status: upstreamResponse.status,
				statusText: upstreamResponse.statusText,
				headers: responseHeaders,
			});
		},
	};
}
