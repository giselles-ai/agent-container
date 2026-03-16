import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import type { z } from "zod";

export type BaseChatRequest = {
	message: string;
	session_id?: string;
	sandbox_id?: string;
	snapshot_id?: string;
};

export type ChatCommand = {
	cmd: string;
	args: string[];
	env?: Record<string, string>;
};

export type StdoutMapper = {
	push(chunk: string): string[];
	flush(): string[];
};

export type ChatAgent<TRequest extends BaseChatRequest> = {
	requestSchema: z.ZodType<TRequest>;
	snapshotId?: string;
	prepareSandbox(input: { input: TRequest; sandbox: Sandbox }): Promise<void>;
	createCommand(input: { input: TRequest }): ChatCommand;
	createStdoutMapper?: () => StdoutMapper;
};

export type RunChatInput<TRequest extends BaseChatRequest> = {
	agent: ChatAgent<TRequest>;
	signal: AbortSignal;
	input: TRequest;
};

const COMMAND_TIMEOUT_EXTENSION_MS = 5 * 60 * 1000;
const ARTIFACT_DIRS = ["./artifacts", "/vercel/sandbox/artifacts"] as const;

function getArtifactMimeType(path: string): string {
	const extension = path.split(".").pop()?.toLowerCase();
	switch (extension) {
		case "md":
			return "text/markdown; charset=utf-8";
		case "json":
			return "application/json; charset=utf-8";
		case "csv":
			return "text/csv; charset=utf-8";
		case "txt":
			return "text/plain; charset=utf-8";
		default:
			return "application/octet-stream";
	}
}

function getArtifactLabel(path: string): string {
	const pieces = path.split("/");
	return pieces[pieces.length - 1] ?? path;
}

async function collectArtifacts(sandbox: Sandbox): Promise<
	Array<{
		type: "artifact";
		path: string;
		size_bytes: number;
		mime_type: string;
		label: string;
	}>
> {
	const artifacts: Array<{
		type: "artifact";
		path: string;
		size_bytes: number;
		mime_type: string;
		label: string;
	}> = [];
	const seen = new Set<string>();
	let discoveryFailed = false;

	for (const artifactDir of ARTIFACT_DIRS) {
		let output = "";
		let discoveryStderr = "";
		let exitCode = 0;

		try {
			const result = await sandbox.runCommand({
				cmd: "find",
				args: [artifactDir, "-type", "f", "-print"],
			});
			output = await result.stdout();
			discoveryStderr = await result.stderr();
			exitCode = typeof result.exitCode === "number" ? result.exitCode : 0;
		} catch (error) {
			discoveryFailed = true;
			console.warn("[chat-run] artifact discovery failed for directory", {
				directory: artifactDir,
				error: error instanceof Error ? error.message : String(error),
				stderr: discoveryStderr,
			});
			continue;
		}

		if (exitCode !== 0 && !output.trim()) {
			discoveryFailed = true;
			console.warn(
				"[chat-run] artifact discovery returned non-zero exit code",
				{
					directory: artifactDir,
					exitCode,
					stderr: discoveryStderr,
				},
			);
			continue;
		}

		if (!output.trim()) {
			continue;
		}

		for (const line of output.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}

			const [path, rawSize] = trimmed.split("\t");
			if (!path) {
				continue;
			}

			const normalizedPath = path.startsWith("/vercel/sandbox/")
				? `./${path.slice("/vercel/sandbox/".length)}`
				: path;
			if (
				!normalizedPath.startsWith("./artifacts/") ||
				seen.has(normalizedPath)
			) {
				continue;
			}

			seen.add(normalizedPath);

			const parsedSize = Number.parseInt(rawSize ?? "0", 10);
			const size_bytes = Number.isNaN(parsedSize) ? 0 : parsedSize;
			artifacts.push({
				type: "artifact",
				path: normalizedPath,
				size_bytes,
				mime_type: getArtifactMimeType(normalizedPath),
				label: getArtifactLabel(normalizedPath),
			});
		}
	}

	if (discoveryFailed && artifacts.length === 0) {
		return [];
	}

	return artifacts;
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

export function runChat<TRequest extends BaseChatRequest>(
	input: RunChatInput<TRequest>,
): Promise<Response> {
	const parsed = input.input;

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

			if (input.signal.aborted) {
				onAbort();
				return;
			}

			input.signal.addEventListener("abort", onAbort);

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
			const mapper = input.agent.createStdoutMapper?.();

			void (async () => {
				try {
					const createFromSnapshot = async (snapshotId: string) => {
						const created = await Sandbox.create({
							source: {
								type: "snapshot",
								snapshotId,
							},
						});
						console.log(
							`[sandbox] created sandbox=${created.sandboxId} from snapshot=${snapshotId}`,
						);
						return created;
					};

					const snapshotId =
						parsed.snapshot_id?.trim() || input.agent.snapshotId?.trim();

					const sandbox = await (async () => {
						if (parsed.sandbox_id) {
							try {
								const existing = await Sandbox.get({
									sandboxId: parsed.sandbox_id,
								});
								if (existing.status !== "running") {
									if (!snapshotId) {
										throw new Error(
											`Sandbox ${parsed.sandbox_id} is ${existing.status}, not running`,
										);
									}
									console.log(
										`[sandbox] sandbox=${parsed.sandbox_id} status=${existing.status}, recreating from snapshot=${snapshotId}`,
									);
									return createFromSnapshot(snapshotId);
								}
								return existing;
							} catch (error) {
								if (!snapshotId) {
									throw error;
								}
								console.log(
									`[sandbox] sandbox=${parsed.sandbox_id} expired, recreating from snapshot=${snapshotId}`,
								);
								return createFromSnapshot(snapshotId);
							}
						}

						if (!snapshotId) {
							throw new Error(
								"Agent must provide snapshotId when sandbox_id is not provided.",
							);
						}
						return createFromSnapshot(snapshotId);
					})();

					enqueueEvent({ type: "sandbox", sandbox_id: sandbox.sandboxId });
					await input.agent.prepareSandbox({
						input: parsed,
						sandbox,
					});
					const command = input.agent.createCommand({
						input: parsed,
					});
					console.info("[chat-run] starting sandbox command", {
						sandboxId: sandbox.sandboxId,
						cmd: command.cmd,
						args: command.args,
						envKeys: Object.keys(command.env ?? {}).sort(),
						hasSessionId:
							typeof parsed.session_id === "string" &&
							parsed.session_id.length > 0,
						hasSandboxId:
							typeof parsed.sandbox_id === "string" &&
							parsed.sandbox_id.length > 0,
						hasSnapshotId:
							typeof parsed.snapshot_id === "string" &&
							parsed.snapshot_id.length > 0,
					});
					await sandbox.extendTimeout(COMMAND_TIMEOUT_EXTENSION_MS);

					await sandbox.runCommand({
						cmd: command.cmd,
						args: command.args,
						env: command.env ?? {},
						stdout: new Writable({
							write(chunk, _encoding, callback) {
								const text =
									typeof chunk === "string" ? chunk : chunk.toString("utf8");
								console.log("[agent-runtime] raw stdout:", text);
								if (mapper) {
									for (const line of mapper.push(text)) {
										enqueueStdout(line);
									}
								} else {
									enqueueStdout(text);
								}
								callback();
							},
						}),
						stderr: new Writable({
							write(chunk, _encoding, callback) {
								const text =
									typeof chunk === "string" ? chunk : chunk.toString("utf8");
								console.error("[chat-run] sandbox stderr", {
									sandboxId: sandbox.sandboxId,
									content: text,
								});
								enqueueEvent({ type: "stderr", content: text });
								callback();
							},
						}),
						signal: abortController.signal,
					});
					const discoveredArtifacts = await collectArtifacts(sandbox);
					for (const artifact of discoveredArtifacts) {
						enqueueEvent(artifact);
					}
					const snapshot = await sandbox.snapshot();
					enqueueEvent({
						type: "snapshot",
						snapshot_id: snapshot.snapshotId,
					});
				} catch (error) {
					if (abortController.signal.aborted) {
						return;
					}

					const message =
						error instanceof Error ? error.message : String(error);
					enqueueEvent({ type: "stderr", content: `[error] ${message}` });
				} finally {
					if (mapper) {
						for (const line of mapper.flush()) {
							enqueueStdout(line);
						}
					}
					input.signal.removeEventListener("abort", onAbort);
					close();
				}
			})();
		},
	});

	return Promise.resolve(
		new Response(stream, {
			headers: {
				"Content-Type": "application/x-ndjson; charset=utf-8",
				"Cache-Control": "no-cache, no-transform",
			},
		}),
	);
}
