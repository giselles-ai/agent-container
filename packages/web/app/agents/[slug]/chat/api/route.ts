import type { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { createSandboxSsePassthroughResponse } from "@/lib/sandbox/sandbox-stream";

type ChatRequestBody = {
	message?: string;
	session_id?: string;
};

export async function POST(req: Request) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
	const input = body?.message?.trim();
	if (!input) {
		return NextResponse.json({ error: "Missing message" }, { status: 400 });
	}
	const sessionId = body?.session_id?.trim();

	const args = ["-p", input, "--output-format", "stream-json"];
	if (sessionId) {
		args.push("--resume", sessionId);
	}
	console.log(args);

	return createSandboxSsePassthroughResponse(
		req,
		async ({
			stdout,
			stderr,
			signal,
		}: {
			stdout: Writable;
			stderr: Writable;
			signal: AbortSignal;
		}) => {
			const sandbox = await Sandbox.create({
				source: {
					type: "snapshot",
					snapshotId: "snap_Jhmuk7xWcnrQGk1czArYhzgtODcj",
				},
			});

			await sandbox.runCommand({
				cmd: "gemini",
				args,
				env: {
					GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
				},
				stdout,
				stderr,
				signal,
			});
		},
	);
}
