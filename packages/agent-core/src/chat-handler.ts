import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import type { z } from "zod";

export type BaseChatRequest = {
	message: string;
	session_id?: string;
	sandbox_id?: string;
};

export type ChatCommand = {
	cmd: string;
	args: string[];
	env?: Record<string, string>;
};

export type ChatAgent<TRequest extends BaseChatRequest> = {
	requestSchema: z.ZodType<TRequest>;
	snapshotId?: string;
	prepareSandbox(input: {
		request: Request;
		parsed: TRequest;
		sandbox: Sandbox;
	}): Promise<void>;
	createCommand(input: { request: Request; parsed: TRequest }): ChatCommand;
};

export type CreateChatHandlerOptions<TRequest extends BaseChatRequest> = {
	agent: ChatAgent<TRequest>;
};

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

export function createChatHandler<TRequest extends BaseChatRequest>(
	options: CreateChatHandlerOptions<TRequest>,
): (request: Request) => Promise<Response> {
	return async function POST(request: Request): Promise<Response> {
		const payload = await request.json().catch(() => null);
		const parsed = options.agent.requestSchema.safeParse(payload);

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
					const sandbox = parsed.data.sandbox_id
						? await Sandbox.get({ sandboxId: parsed.data.sandbox_id })
						: await (async () => {
								const snapshotId = options.agent.snapshotId?.trim();
								if (!snapshotId) {
									throw new Error(
										"Agent must provide snapshotId when sandbox_id is not provided.",
									);
								}

								return Sandbox.create({
									source: {
										type: "snapshot",
										snapshotId,
									},
								});
							})();

					enqueueEvent({ type: "sandbox", sandbox_id: sandbox.sandboxId });
					await options.agent.prepareSandbox({
						request,
						parsed: parsed.data,
						sandbox,
					});
					const command = options.agent.createCommand({
						request,
						parsed: parsed.data,
					});

					await sandbox.runCommand({
						cmd: command.cmd,
						args: command.args,
						env: command.env ?? {},
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
