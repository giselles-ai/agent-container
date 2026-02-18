import { z } from "zod";

const DEFAULT_BASE_URL = "https://studio.giselles.ai";

const agentRunSchema = z.object({
	type: z.literal("agent.run"),
	message: z.string().min(1),
	document: z.string().optional(),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

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

export type AgentRunnerOptions = {
	apiKey?: string;
	baseUrl?: string;
};

export type AgentRunnerHandler = {
	POST: (request: Request) => Promise<Response>;
};

export function handleAgentRunner(options?: AgentRunnerOptions): AgentRunnerHandler {
	const apiKey =
		options?.apiKey?.trim() || process.env.GISELLE_API_KEY?.trim() || "";

	const baseUrl = trimTrailingSlash(
		options?.baseUrl?.trim() || DEFAULT_BASE_URL,
	);
	const endpoint = `${baseUrl}/api/agent`;

	return {
		POST: async (request: Request): Promise<Response> => {
			const payload = await request.json().catch(() => null);
			const parsed = agentRunSchema.safeParse(payload);

			if (!parsed.success) {
				return invalidRequestResponse(parsed.error.flatten());
			}

			let cloudResponse: Response;
			try {
				cloudResponse = await fetch(endpoint, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify(parsed.data),
					signal: request.signal,
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to connect to cloud API.";
				return badGatewayResponse(message);
			}

			const headers = new Headers(cloudResponse.headers);
			headers.set(
				"Content-Type",
				headers.get("Content-Type") ?? "application/x-ndjson; charset=utf-8",
			);
			headers.set("Cache-Control", "no-cache, no-transform");

			return new Response(cloudResponse.body, {
				status: cloudResponse.status,
				statusText: cloudResponse.statusText,
				headers,
			});
		},
	};
}
