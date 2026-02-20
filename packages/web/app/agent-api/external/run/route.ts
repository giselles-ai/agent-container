import {
	streamAgent,
	toNdjsonResponse,
} from "@giselles-ai/sandbox-agent/client";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXTERNAL_API_URL = "https://studio.giselles.ai";

const agentRunSchema = z.object({
	type: z.literal("agent.run"),
	message: z.string().min(1),
	document: z.string().optional(),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function buildExternalHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		authorization: `Bearer ${requiredEnv("EXTERNAL_AGENT_API_BEARER_TOKEN")}`,
	};

	const bypass = process.env.EXTERNAL_AGENT_API_PROTECTION_BYPASS?.trim();
	if (bypass) {
		headers["x-vercel-protection-bypass"] = bypass;
	}

	return headers;
}

export async function POST(request: Request): Promise<Response> {
	const payload = await request.json().catch(() => null);
	const parsed = agentRunSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json(
			{
				ok: false,
				errorCode: "INVALID_REQUEST",
				message: "Invalid request payload.",
				error: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	return toNdjsonResponse(
		streamAgent({
			endpoint: `${EXTERNAL_API_URL}/agent-api/run`,
			message: parsed.data.message,
			document: parsed.data.document,
			sessionId: parsed.data.session_id,
			sandboxId: parsed.data.sandbox_id,
			headers: buildExternalHeaders(),
			signal: request.signal,
		}),
	);
}
