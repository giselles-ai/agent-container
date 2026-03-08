import { createAgentApi } from "@giselles-ai/agent/server";
import { extractBearerToken, verifyApiToken } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authHook(request: Request): Response | undefined {
	const token = extractBearerToken(request);
	if (!token || !verifyApiToken(token)) {
		return Response.json(
			{ ok: false, errorCode: "UNAUTHORIZED", message: "Unauthorized." },
			{ status: 401 },
		);
	}
}

const api = createAgentApi({
	basePath: "/agent-api",
	store: { adapter: "redis" },
	agent: {
		env: {
			VERCEL_PROTECTION_BYPASS: process.env.VERCEL_PROTECTION_BYPASS,
			GISELLE_PROTECTION_BYPASS: process.env.GISELLE_PROTECTION_BYPASS,
		},
		tools: {
			browser: {},
		},
	},
	hooks: {
		chat: { before: authHook },
		build: { before: authHook },
	},
});

export const GET = api.GET;
export const POST = api.POST;
export const OPTIONS = api.OPTIONS;
