import { Writable } from "node:stream";
import type { MCPServerConfig } from "@google/gemini-cli-core";
import { Sandbox } from "@vercel/sandbox";
import { z } from "zod";

const GEMINI_SETTINGS_PATH = "/home/vercel-sandbox/.gemini/settings.json";

interface GeminiSettings {
	mcpServers?: Record<string, MCPServerConfig>;
	[key: string]: unknown;
}

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

function extractTokenFromRequest(request: Request): string | undefined {
	const oidcToken = request.headers.get("x-vercel-oidc-token")?.trim();
	if (oidcToken) {
		return oidcToken;
	}

	const authorization = request.headers.get("authorization")?.trim();
	if (!authorization) {
		return undefined;
	}

	if (/^bearer\s+/i.test(authorization)) {
		return authorization.replace(/^bearer\s+/i, "").trim();
	}

	return authorization;
}

function buildMcpEnv(input: {
	bridgeBaseUrl: string;
	bridgeSessionId: string;
	bridgeToken: string;
	oidcToken?: string;
	vercelProtectionBypass?: string;
	giselleProtectionBypass?: string;
}): Record<string, string> {
	const env: Record<string, string> = {
		BROWSER_TOOL_BRIDGE_BASE_URL: input.bridgeBaseUrl,
		BROWSER_TOOL_BRIDGE_SESSION_ID: input.bridgeSessionId,
		BROWSER_TOOL_BRIDGE_TOKEN: input.bridgeToken,
	};

	if (input.oidcToken) {
		env.VERCEL_OIDC_TOKEN = input.oidcToken;
	}

	if (input.vercelProtectionBypass?.trim()) {
		env.VERCEL_PROTECTION_BYPASS = input.vercelProtectionBypass.trim();
	}

	if (input.giselleProtectionBypass?.trim()) {
		env.GISELLE_PROTECTION_BYPASS = input.giselleProtectionBypass.trim();
	}

	return env;
}

async function patchGeminiSettingsEnv(
	sandbox: Sandbox,
	mcpEnv: Record<string, string>,
): Promise<void> {
	const buffer = await sandbox.readFileToBuffer({
		path: GEMINI_SETTINGS_PATH,
	});
	if (!buffer) {
		throw new Error(
			`Gemini settings not found in sandbox at ${GEMINI_SETTINGS_PATH}. Ensure the snapshot contains a pre-configured settings.json.`,
		);
	}

	const settings: GeminiSettings = JSON.parse(new TextDecoder().decode(buffer));

	if (settings.mcpServers) {
		settings.mcpServers = Object.fromEntries(
			Object.entries(settings.mcpServers).map(([key, server]) => [
				key,
				{ ...server, env: { ...server.env, ...mcpEnv } },
			]),
		);
	}

	await sandbox.writeFiles([
		{
			path: GEMINI_SETTINGS_PATH,
			content: Buffer.from(JSON.stringify(settings, null, 2)),
		},
	]);
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

type GeminiChatRouteOptions = {
	requestParser?: typeof requestSchema;
};

export function createGeminiChatHandler(
	_options: GeminiChatRouteOptions = {},
): (request: Request) => Promise<Response> {
	const requestParser = requestSchema;

	return async function POST(request: Request): Promise<Response> {
		const payload = await request.json().catch(() => null);
		const parsed = requestParser.safeParse(payload);

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
					const sandboxSnapshotId = requiredEnv("SANDBOX_SNAPSHOT_ID");
					const oidcToken =
						extractTokenFromRequest(request) ??
						process.env.VERCEL_OIDC_TOKEN ??
						"";
					if (!oidcToken) {
						throw new Error(
							"Planner authentication is required: set OIDC token in x-vercel-oidc-token or VERCEL_OIDC_TOKEN.",
						);
					}
					const vercelProtectionBypass =
						process.env.VERCEL_PROTECTION_BYPASS?.trim() || undefined;
					const giselleProtectionBypass =
						process.env.GISELLE_PROTECTION_PASSWORD?.trim() || undefined;

					const bridgeBaseUrl =
						process.env.BROWSER_TOOL_BRIDGE_BASE_URL?.trim() ||
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

					const mcpEnv = buildMcpEnv({
						bridgeBaseUrl,
						bridgeSessionId,
						bridgeToken,
						oidcToken,
						vercelProtectionBypass,
						giselleProtectionBypass,
					});

					await patchGeminiSettingsEnv(sandbox, mcpEnv);

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
	};
}
