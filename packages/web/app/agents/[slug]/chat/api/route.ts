import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";

type ChatRequestBody = {
	message?: string;
	session_id?: string;
	sandbox_id?: string;
	files?: Array<{
		name: string;
		type: string;
		size: number;
		pathname: string;
		url: string;
	}>;
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
	const incomingFiles = body?.files ?? [];

	const sanitizeFilename = (name: string, fallback: string) => {
		const trimmed = name.trim().replace(/[/\\\\]+/g, "_");
		const safe = trimmed.replace(/[^\w.\-+]+/g, "_");
		return safe.length > 0 ? safe : fallback;
	};

	let prompt = input;
	const args = ["--prompt", prompt, "--output-format", "stream-json"];
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

				let sandboxPaths: string[] = [];
				if (incomingFiles.length > 0) {
					const seen = new Map<string, number>();
					const uploadFiles = await Promise.all(
						incomingFiles.map(async (file, index) => {
							const fallback = `file-${index + 1}`;
							const baseName = sanitizeFilename(file.name, fallback);
							const count = seen.get(baseName) ?? 0;
							seen.set(baseName, count + 1);
							const uniqueName =
								count === 0 ? baseName : `${count}-${baseName}`;
							const targetPath = `/vercel/sandbox/uploads/${uniqueName}`;
							const response = await fetch(file.url);
							if (!response.ok) {
								throw new Error(`Failed to fetch file: ${file.name}`);
							}
							const arrayBuffer = await response.arrayBuffer();
							return {
								path: targetPath,
								content: Buffer.from(arrayBuffer),
							};
						}),
					);

					sandboxPaths = uploadFiles.map((file) => file.path);
					await sandbox.writeFiles(uploadFiles);
				}

				if (sandboxPaths.length > 0) {
					prompt = [
						"Available files in the sandbox:",
						...sandboxPaths.map((path) => `- ${path}`),
						"",
						"User message:",
						input,
					].join("\n");
					args[1] = prompt;
				}

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
