import { dirname } from "node:path";
import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { z } from "zod";

const requestSchema = z.object({
	message: z.string().min(1),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
	bridge_session_id: z.string().min(1),
	bridge_token: z.string().min(1),
});

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function parseBooleanFlag(value: string | undefined): boolean {
	if (!value) {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

function firstNonEmptyLine(text: string): string | null {
	const line = text
		.split("\n")
		.map((entry) => entry.trim())
		.find((entry) => entry.length > 0);

	return line ?? null;
}

async function runCommandCapture(
	sandbox: Sandbox,
	options: {
		cmd: string;
		args: string[];
		cwd?: string;
		env?: Record<string, string>;
		signal: AbortSignal;
	},
): Promise<{ stdout: string; stderr: string }> {
	const result = await sandbox.runCommand({
		cmd: options.cmd,
		args: options.args,
		cwd: options.cwd,
		env: options.env,
		signal: options.signal,
	});

	const [stdout, stderr] = await Promise.all([
		result.stdout({ signal: options.signal }).catch(() => ""),
		result.stderr({ signal: options.signal }).catch(() => ""),
	]);

	return { stdout, stderr };
}

async function discoverRepoRoot(
	sandbox: Sandbox,
	signal: AbortSignal,
): Promise<string | null> {
	const preferredRoot = process.env.RPA_SANDBOX_REPO_ROOT?.trim() ?? "";

	const { stdout } = await runCommandCapture(sandbox, {
		cmd: "bash",
		args: [
			"-lc",
			[
				"set -e",
				'for d in "$RPA_SANDBOX_REPO_ROOT" /vercel/sandbox /workspace /home/vercel-sandbox; do',
				'  if [ -n "$d" ] && [ -f "$d/pnpm-workspace.yaml" ] && [ -d "$d/packages/mcp-server" ]; then',
				'    echo "$d"',
				"    exit 0",
				"  fi",
				"done",
			].join("\n"),
		],
		env: {
			RPA_SANDBOX_REPO_ROOT: preferredRoot,
		},
		signal,
	});

	return firstNonEmptyLine(stdout);
}

async function ensureMcpDistPaths(input: {
	sandbox: Sandbox;
	signal: AbortSignal;
	enqueueEvent: (payload: Record<string, unknown>) => void;
}): Promise<{ mcpServerDistPath: string; mcpServerCwd: string }> {
	const explicitMcpDistPath = process.env.RPA_MCP_SERVER_DIST_PATH?.trim();
	const explicitMcpCwd = process.env.RPA_MCP_SERVER_CWD?.trim();

	if (explicitMcpDistPath) {
		return {
			mcpServerDistPath: explicitMcpDistPath,
			mcpServerCwd: explicitMcpCwd || dirname(explicitMcpDistPath),
		};
	}

	const repoRoot = await discoverRepoRoot(input.sandbox, input.signal);

	if (!repoRoot) {
		throw new Error(
			[
				"Failed to locate sandbox repo root containing packages/mcp-server.",
				"Set RPA_SANDBOX_REPO_ROOT or RPA_MCP_SERVER_DIST_PATH to resolve this.",
			].join(" "),
		);
	}

	const mcpServerDistPath = `${repoRoot}/packages/mcp-server/dist/index.js`;
	const plannerDistPath = `${repoRoot}/packages/rpa-planner/dist/index.js`;

	const checkDistReady = async () => {
		const { stdout, stderr } = await runCommandCapture(input.sandbox, {
			cmd: "bash",
			args: [
				"-lc",
				[
					'if [ -f "$MCP_SERVER_DIST_PATH" ] && [ -f "$PLANNER_DIST_PATH" ]; then',
					'  echo "ready"',
					"fi",
				].join("\n"),
			],
			env: {
				MCP_SERVER_DIST_PATH: mcpServerDistPath,
				PLANNER_DIST_PATH: plannerDistPath,
			},
			signal: input.signal,
		});

		const ready = firstNonEmptyLine(stdout) === "ready";
		return { ready, stderr };
	};

	const initialCheck = await checkDistReady();
	if (!initialCheck.ready) {
		const skipSandboxBuild = parseBooleanFlag(
			process.env.RPA_SKIP_SANDBOX_BUILD,
		);

		if (!skipSandboxBuild) {
			input.enqueueEvent({
				type: "stderr",
				content: `[info] Building MCP server in sandbox at ${repoRoot}`,
			});

			const buildResult = await runCommandCapture(input.sandbox, {
				cmd: "bash",
				args: [
					"-lc",
					[
						"set -e",
						'pnpm --dir "$REPO_ROOT" --filter @giselles/rpa-planner run build',
						'pnpm --dir "$REPO_ROOT" --filter @giselles/mcp-server run build',
					].join("\n"),
				],
				env: {
					REPO_ROOT: repoRoot,
				},
				signal: input.signal,
			});

			if (buildResult.stdout.trim().length > 0) {
				input.enqueueEvent({ type: "stderr", content: buildResult.stdout });
			}
			if (buildResult.stderr.trim().length > 0) {
				input.enqueueEvent({ type: "stderr", content: buildResult.stderr });
			}
		}

		const finalCheck = await checkDistReady();
		if (!finalCheck.ready) {
			throw new Error(
				[
					`MCP dist files are missing in sandbox: ${mcpServerDistPath} and/or ${plannerDistPath}.`,
					"Ensure the snapshot contains built artifacts or allow sandbox build.",
				].join(" "),
			);
		}
	}

	return {
		mcpServerDistPath,
		mcpServerCwd: repoRoot,
	};
}

function buildGeminiSettings(input: {
	bridgeBaseUrl: string;
	bridgeSessionId: string;
	bridgeToken: string;
	openAiApiKey: string;
	vercelProtectionBypass?: string;
	mcpServerDistPath: string;
	mcpServerCwd: string;
}) {
	const mcpEnv: Record<string, string> = {
		RPA_BRIDGE_BASE_URL: input.bridgeBaseUrl,
		RPA_BRIDGE_SESSION_ID: input.bridgeSessionId,
		RPA_BRIDGE_TOKEN: input.bridgeToken,
		OPENAI_API_KEY: input.openAiApiKey,
	};

	if (input.vercelProtectionBypass?.trim()) {
		mcpEnv.VERCEL_PROTECTION_BYPASS = input.vercelProtectionBypass.trim();
	}

	return {
		security: {
			auth: {
				selectedType: "gemini-api-key",
			},
		},
		mcpServers: {
			rpa_bridge: {
				command: "node",
				args: [input.mcpServerDistPath],
				cwd: input.mcpServerCwd,
				env: mcpEnv,
			},
		},
	};
}

function emitText(
	controller: ReadableStreamDefaultController<Uint8Array>,
	text: string,
	encoder: TextEncoder,
): void {
	if (text.length === 0) {
		return;
	}
	controller.enqueue(encoder.encode(text));
}

function emitEvent(
	controller: ReadableStreamDefaultController<Uint8Array>,
	payload: Record<string, unknown>,
	encoder: TextEncoder,
): void {
	emitText(controller, `${JSON.stringify(payload)}\n`, encoder);
}

export const runtime = "nodejs";

export async function POST(request: Request) {
	const payload = await request.json().catch(() => null);
	const parsed = requestSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{
				error: "Invalid request payload.",
				detail: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			const abortController = new AbortController();
			let closed = false;

			const close = () => {
				if (closed) {
					return;
				}

				closed = true;
				try {
					controller.close();
				} catch {
					// Ignore already closed stream.
				}
			};

			const onAbort = () => {
				if (!abortController.signal.aborted) {
					abortController.abort();
				}
				close();
			};

			if (request.signal.aborted) {
				onAbort();
				return;
			}

			request.signal.addEventListener("abort", onAbort);

			const enqueueEvent = (payload: Record<string, unknown>) => {
				if (closed) {
					return;
				}
				emitEvent(controller, payload, encoder);
			};

			const enqueueStdout = (text: string) => {
				if (closed) {
					return;
				}

				emitText(controller, text, encoder);
			};

			(async () => {
				const geminiApiKey = requiredEnv("GEMINI_API_KEY");
				const openAiApiKey = requiredEnv("OPENAI_API_KEY");
				const sandboxSnapshotId = requiredEnv("RPA_SANDBOX_SNAPSHOT_ID");
				const aiGatewayApiKey = requiredEnv("AI_GATEWAY_API_KEY");
				const vercelProtectionBypass =
					process.env.VERCEL_PROTECTION_BYPASS?.trim() || undefined;

				const bridgeBaseUrl =
					process.env.RPA_BRIDGE_BASE_URL?.trim() ||
					new URL(request.url).origin;

				const {
					message,
					session_id: sessionId,
					sandbox_id: sandboxId,
					bridge_session_id: bridgeSessionId,
					bridge_token: bridgeToken,
				} = parsed.data;

				const sandbox = sandboxId
					? await Sandbox.get({ sandboxId })
					: await Sandbox.create({
							source: {
								type: "snapshot",
								snapshotId: sandboxSnapshotId,
							},
						});

				enqueueEvent({ type: "sandbox", sandbox_id: sandbox.sandboxId });

				const { mcpServerDistPath, mcpServerCwd } = await ensureMcpDistPaths({
					sandbox,
					signal: abortController.signal,
					enqueueEvent,
				});

				enqueueEvent({
					type: "stderr",
					content: `[info] MCP server path: ${mcpServerDistPath}`,
				});

				await sandbox.writeFiles([
					{
						path: "/home/vercel-sandbox/.gemini/settings.json",
						content: Buffer.from(
							JSON.stringify(
								buildGeminiSettings({
									bridgeBaseUrl,
									bridgeSessionId,
									bridgeToken,
									openAiApiKey,
									vercelProtectionBypass,
									mcpServerDistPath,
									mcpServerCwd,
								}),
								null,
								2,
							),
						),
					},
				]);

				const args = [
					"--prompt",
					message,
					"--output-format",
					"stream-json",
					"--approval-mode",
					"yolo",
				];

				if (sessionId) {
					args.push("--resume", sessionId);
				}

				await sandbox.runCommand({
					cmd: "gemini",
					args,
					env: {
						GEMINI_API_KEY: geminiApiKey,
						OPENAI_API_KEY: openAiApiKey,
						AI_GATEWAY_API_KEY: aiGatewayApiKey,
					},
					stdout: new Writable({
						write(chunk, _encoding, callback) {
							const text =
								typeof chunk === "string" ? chunk : chunk.toString("utf8");
							enqueueStdout(text);
							callback();
						},
					}),
					stderr: new Writable({
						write(chunk, _encoding, callback) {
							const text =
								typeof chunk === "string" ? chunk : chunk.toString("utf8");
							enqueueEvent({ type: "stderr", content: text });
							callback();
						},
					}),
					signal: abortController.signal,
				});
			})()
				.catch((error) => {
					if (abortController.signal.aborted) {
						return;
					}

					const message =
						error instanceof Error ? error.message : String(error);
					enqueueEvent({ type: "stderr", content: `[error] ${message}` });
				})
				.finally(() => {
					request.signal.removeEventListener("abort", onAbort);
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
