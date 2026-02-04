import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";

type ChatRequestBody = {
	message?: string;
	session_id?: string;
	sandbox_id?: string;
};

const createTimestamp = () => new Date().toISOString();

export async function POST(req: Request) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
	const input = body?.message?.trim();
	if (!input) {
		return NextResponse.json({ error: "Missing message" }, { status: 400 });
	}
	const sessionId = body?.session_id?.trim();
	const sandboxId = body?.sandbox_id?.trim();

	const args = ["--prompt", input, "--output-format", "stream-json"];
	if (sessionId) {
		args.push("--resume", sessionId);
	}

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const abortController = new AbortController();

			const enqueueText = (text: string) => {
				if (closed || text.length === 0) return;
				controller.enqueue(encoder.encode(text));
			};

			const enqueueEvent = (payload: Record<string, string>) => {
				enqueueText(`${JSON.stringify(payload)}\n`);
			};

			const close = () => {
				if (closed) return;
				closed = true;
				controller.close();
			};

			const onAbort = () => {
				if (!abortController.signal.aborted) {
					abortController.abort();
				}
				close();
			};

			if (req.signal.aborted) {
				onAbort();
				return;
			}

			req.signal.addEventListener("abort", onAbort);

			(async () => {
				const sandbox = sandboxId
					? await Sandbox.get({ sandboxId })
					: await Sandbox.create({
							source: {
								type: "snapshot",
								snapshotId: "snap_Jhmuk7xWcnrQGk1czArYhzgtODcj",
							},
						});

				enqueueEvent({
					type: "sandbox",
					sandbox_id: sandbox.sandboxId,
				});

				await sandbox.writeFiles([
					{
						path: "/home/vercel-sandbox/.gemini/settings.json",
						content: Buffer.from(
							`{ "security": { "auth": { "selectedType": "gemini-api-key" } } }`,
						),
					},
				]);

				await sandbox.runCommand({
					cmd: "gemini",
					args,
					env: {
						GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
					},
					stdout: new Writable({
						write(chunk, _encoding, callback) {
							const text =
								typeof chunk === "string" ? chunk : chunk.toString("utf8");
							enqueueText(text);
							callback();
						},
					}),
					stderr: new Writable({
						write(chunk, _encoding, callback) {
							const text =
								typeof chunk === "string" ? chunk : chunk.toString("utf8");
							enqueueEvent({
								type: "stderr",
								content: text,
							});
							callback();
						},
					}),
					signal: abortController.signal,
				});
			})()
				.catch((error) => {
					if (!abortController.signal.aborted) {
						const message =
							error instanceof Error ? error.message : String(error);
						enqueueEvent({
							type: "stderr",
							content: `[error] ${createTimestamp()} ${message}`,
						});
					}
				})
				.finally(() => {
					req.signal.removeEventListener("abort", onAbort);
					close();
				});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
		},
	});
}
