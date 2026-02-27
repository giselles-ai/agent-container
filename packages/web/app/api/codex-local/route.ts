import { createCodexAgent, runChat } from "@giselles-ai/sandbox-agent";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
	message: z.string().min(1),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response("Invalid JSON body", { status: 400 });
	}

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return new Response("Invalid request body", { status: 400 });
	}

	const { message, session_id, sandbox_id } = parsed.data;

	try {
		const agent = createCodexAgent({
			env: {
				CODEX_API_KEY: process.env.CODEX_API_KEY ?? "",
				SANDBOX_SNAPSHOT_ID: process.env.SANDBOX_SNAPSHOT_ID ?? "",
			},
		});

		return await runChat({
			agent,
			signal: request.signal,
			input: {
				message,
				session_id,
				sandbox_id,
			},
		});
	} catch (error) {
		console.error("Codex local error:", error);
		return new Response("Internal server error", { status: 500 });
	}
}
