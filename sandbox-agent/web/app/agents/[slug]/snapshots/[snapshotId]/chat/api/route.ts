import { Writable } from "node:stream";
import type { ChatAgent } from "@giselles-ai/sandbox-agent";
import * as sandboxAgentLib from "@giselles-ai/sandbox-agent";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";

type ChatRequestBody = {
	message?: string;
	session_id?: string;
	sandbox_id?: string;
	agent_type?: string;
	snapshot_id?: string;
	files?: Array<{
		name: string;
		type: string;
		size: number;
		pathname: string;
		url: string;
	}>;
};

const createTimestamp = () => new Date().toISOString();
type AgentType = "gemini" | "codex";

function resolveAgentType(): AgentType {
	const value = process.env.AGENT_TYPE?.trim().toLowerCase();
	if (value === "codex") {
		return "codex";
	}

	return "gemini";
}

function resolveAgentTypeForRequest(
	requestAgentType: string | undefined,
): AgentType {
	const bodyType = requestAgentType?.trim().toLowerCase();
	if (bodyType === "codex") {
		return "codex";
	}
	if (bodyType === "gemini") {
		return "gemini";
	}

	return resolveAgentType();
}

function createRouteAgent(
	snapshotId: string,
	agentType: AgentType,
): ChatAgent<{ message: string; session_id?: string; sandbox_id?: string }> {
	const trimmedSnapshotId = snapshotId.trim();
	const sharedEnv = {
		SANDBOX_SNAPSHOT_ID: trimmedSnapshotId,
	};

	if (agentType === "codex") {
		const createCodexAgent = (
			sandboxAgentLib as {
				createCodexAgent?: (options: {
					snapshotId?: string;
					env?: Record<string, string>;
				}) => ChatAgent<{
					message: string;
					session_id?: string;
					sandbox_id?: string;
				}>;
			}
		).createCodexAgent;

		if (!createCodexAgent) {
			throw new Error(
				"Missing required export: createCodexAgent from @giselles-ai/sandbox-agent.",
			);
		}

		const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
		const codexApiKey = process.env.CODEX_API_KEY?.trim();
		const env = {
			...sharedEnv,
			...(openAiApiKey ? { OPENAI_API_KEY: openAiApiKey } : {}),
			...(codexApiKey ? { CODEX_API_KEY: codexApiKey } : {}),
		};

		return createCodexAgent({
			snapshotId: trimmedSnapshotId,
			env,
		});
	}

	return sandboxAgentLib.createGeminiAgent({
		snapshotId: trimmedSnapshotId,
		env: {
			GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
			...sharedEnv,
		},
	});
}

async function writeGeminiSettings(sandbox: Sandbox) {
	await sandbox.writeFiles([
		{
			path: "/home/vercel-sandbox/.gemini/settings.json",
			content: Buffer.from(
				`{ "security": { "auth": { "selectedType": "gemini-api-key" } } }`,
			),
		},
	]);
}

function sanitizeFilename(name: string, fallback: string) {
	const trimmed = name.trim().replace(/[/\\\\]+/g, "_");
	const safe = trimmed.replace(/[^\w.\-+]+/g, "_");
	return safe.length > 0 ? safe : fallback;
}

function parseRequest(body: ChatRequestBody | null) {
	if (!body) {
		return {
			ok: false as const,
			error: NextResponse.json(
				{ error: "Missing request body" },
				{ status: 400 },
			),
		};
	}

	const message = body.message?.trim();
	if (!message) {
		return {
			ok: false as const,
			error: NextResponse.json({ error: "Missing message" }, { status: 400 }),
		};
	}

	const session_id = body.session_id?.trim();
	if (body.session_id !== undefined && !session_id) {
		return {
			ok: false as const,
			error: NextResponse.json(
				{
					error: "Invalid request",
					details: [
						{
							code: "custom",
							path: ["session_id"],
							message: "Invalid input: expected a string with min length 1",
						},
					],
				},
				{ status: 422 },
			),
		};
	}

	const sandbox_id = body.sandbox_id?.trim();
	if (body.sandbox_id !== undefined && !sandbox_id) {
		return {
			ok: false as const,
			error: NextResponse.json(
				{
					error: "Invalid request",
					details: [
						{
							code: "custom",
							path: ["sandbox_id"],
							message: "Invalid input: expected a string with min length 1",
						},
					],
				},
				{ status: 422 },
			),
		};
	}

	if (body.files !== undefined && !Array.isArray(body.files)) {
		return {
			ok: false as const,
			error: NextResponse.json(
				{
					error: "Invalid request",
					details: [
						{
							code: "custom",
							path: ["files"],
							message: "Invalid input: expected an array",
						},
					],
				},
				{ status: 422 },
			),
		};
	}

	return {
		ok: true as const,
		data: {
			message,
			session_id,
			sandbox_id,
			agent_type: body.agent_type?.trim(),
			snapshot_id: body.snapshot_id?.trim(),
			files: body.files ?? [],
		},
	};
}

export async function initSandbox(snapshotId: string) {
	const sandbox = await Sandbox.create({
		source: {
			type: "snapshot",
			snapshotId,
		},
	});
	return sandbox;
}

export async function POST(
	req: Request,
	ctx: RouteContext<"/agents/[slug]/snapshots/[snapshotId]/chat/api">,
) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const { snapshotId } = await ctx.params;
	const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
	if (!body?.message?.trim()) {
		return NextResponse.json({ error: "Missing message" }, { status: 400 });
	}

	const requestParse = parseRequest(body);
	if (!requestParse.ok) {
		return requestParse.error;
	}

	const {
		message,
		session_id: sessionId,
		sandbox_id: sandboxId,
		agent_type: requestAgentType,
		snapshot_id: snapshotOverride,
		files: incomingFiles,
	} = requestParse.data;
	const effectiveSnapshotId = snapshotOverride || snapshotId;

	let prompt = message;
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

			const captureCommand = async (
				sandbox: Sandbox,
				cmd: string,
				args: string[],
			) => {
				const result = await sandbox.runCommand({
					cmd,
					args,
					cwd: "/vercel/sandbox",
					signal: abortController.signal,
				});
				const output = await result.stdout({ signal: abortController.signal });
				const stderr = await result.stderr({ signal: abortController.signal });
				if (stderr) {
					enqueueEvent({
						type: "stderr",
						content: stderr,
					});
				}
				return output;
			};

			(async () => {
				const sandbox = sandboxId
					? await Sandbox.get({ sandboxId })
					: await initSandbox(effectiveSnapshotId);
				const agentType = resolveAgentTypeForRequest(requestAgentType);
				const agent = createRouteAgent(effectiveSnapshotId, agentType);
				const mapper = agent.createStdoutMapper?.();

				enqueueEvent({
					type: "sandbox",
					sandbox_id: sandbox.sandboxId,
				});

				await agent.prepareSandbox({
					input: {
						message: prompt,
						session_id: sessionId,
						sandbox_id: sandboxId,
					},
					sandbox,
				});

				if (agentType === "gemini") {
					await writeGeminiSettings(sandbox);
				}

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
						message,
					].join("\n");
				}

				const command = agent.createCommand({
					input: {
						message: prompt,
						session_id: sessionId,
						sandbox_id: sandboxId,
					},
				});

				await sandbox.runCommand({
					cmd: command.cmd,
					args: command.args,
					cwd: "/vercel/sandbox",
					env: command.env ?? {},
					stdout: new Writable({
						write(chunk, _encoding, callback) {
							const text =
								typeof chunk === "string" ? chunk : chunk.toString("utf8");
							if (mapper) {
								for (const line of mapper.push(text)) {
									enqueueText(line);
								}
							} else {
								enqueueText(text);
							}
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

				if (!abortController.signal.aborted) {
					const output = await captureCommand(sandbox, "find", [
						"-maxdepth",
						"4",
						"-type",
						"f",
						"-name",
						"*.pptx",
					]);
					const files = output
						.split("\n")
						.map((line) => line.trim())
						.filter((line) => line.length > 0);
					for (const path of files) {
						enqueueEvent({
							type: "artifact",
							path,
							status: "success",
						});
					}
				}
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
					if (mapper) {
						for (const line of mapper.flush()) {
							enqueueText(line);
						}
					}
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
