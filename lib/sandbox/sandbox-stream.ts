import { Writable } from "node:stream";
import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	UI_MESSAGE_STREAM_HEADERS,
	type UIMessage,
	type UIMessageStreamWriter,
} from "ai";

type SandboxRunResult = { exitCode?: number } | number;
export type SandboxStreamRunner = (options: {
	stdout: Writable;
	stderr: Writable;
	signal: AbortSignal;
}) => Promise<SandboxRunResult> | SandboxRunResult;

type SandboxStreamController = {
	close: () => void;
	enqueue: (chunk?: Uint8Array) => void;
};

export function extractLatestUserText(
	messages: UIMessage[] | undefined,
): string | null {
	if (!messages?.length) {
		return null;
	}

	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (message.role !== "user") {
			continue;
		}
		const text = message.parts
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n")
			.trim();
		if (text.length > 0) {
			return text;
		}
	}

	return null;
}

function resolveExitCode(result: SandboxRunResult): number | undefined {
	if (typeof result === "number") {
		return result;
	}
	if (result && typeof result === "object" && "exitCode" in result) {
		return typeof result.exitCode === "number" ? result.exitCode : undefined;
	}
	return undefined;
}

export function createSandboxStreamResponse(
	req: Request,
	runSandbox: SandboxStreamRunner,
) {
	const abortController = new AbortController();
	let abortListenerAttached = false;
	let abortNotified = false;
	let uiWriter: UIMessageStreamWriter | null = null;

	const onAbort = () => {
		if (!abortController.signal.aborted) {
			abortController.abort();
		}
		if (uiWriter && !abortNotified) {
			abortNotified = true;
			uiWriter.write({ type: "abort" });
		}
	};

	const detachAbortListener = () => {
		if (abortListenerAttached) {
			req.signal.removeEventListener("abort", onAbort);
			abortListenerAttached = false;
		}
	};

	if (req.signal.aborted) {
		onAbort();
	} else {
		req.signal.addEventListener("abort", onAbort);
		abortListenerAttached = true;
	}

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			uiWriter = writer;
			const textId = crypto.randomUUID();
			let textEnded = false;
			let finished = false;

			const endText = () => {
				if (!textEnded) {
					writer.write({ type: "text-end", id: textId });
					textEnded = true;
				}
			};

			const finish = (finishReason: "stop" | "error" | "other") => {
				if (!finished) {
					writer.write({ type: "finish", finishReason });
					finished = true;
				}
			};

			const sendEvent = (data: string, event?: string) => {
				const lines = data
					.replace(/\r\n/g, "\n")
					.replace(/\r/g, "\n")
					.split("\n");
				const payload = lines.join("\n");
				if (event === "stderr") {
					writer.write({
						type: "data-stderr",
						data: { text: payload },
						transient: true,
					});
					return;
				}
				writer.write({ type: "text-delta", id: textId, delta: payload });
			};

			writer.write({ type: "start" });
			writer.write({ type: "text-start", id: textId });
			if (abortController.signal.aborted && !abortNotified) {
				abortNotified = true;
				writer.write({ type: "abort" });
			}

			const stdout = new Writable({
				write(chunk, _encoding, callback) {
					const text =
						typeof chunk === "string" ? chunk : chunk.toString("utf8");
					sendEvent(text);
					callback();
				},
			});

			const stderr = new Writable({
				write(chunk, _encoding, callback) {
					const text =
						typeof chunk === "string" ? chunk : chunk.toString("utf8");
					sendEvent(text, "stderr");
					callback();
				},
			});

			try {
				const result = await runSandbox({
					stdout,
					stderr,
					signal: abortController.signal,
				});
				const exitCode = resolveExitCode(result) ?? 0;

				endText();
				writer.write({
					type: "data-exit",
					data: { code: exitCode },
					transient: true,
				});
				finish("stop");
			} catch (error) {
				if (!abortController.signal.aborted) {
					const message =
						error instanceof Error ? error.message : String(error);
					writer.write({ type: "error", errorText: message });
					endText();
					finish("error");
				} else if (!abortNotified) {
					abortNotified = true;
					writer.write({ type: "abort" });
					endText();
					finish("other");
				}
			} finally {
				endText();
				finish("other");
				detachAbortListener();
			}
		},
	});

	return createUIMessageStreamResponse({ stream });
}

export function createSandboxSsePassthroughResponse(
	req: Request,
	runSandbox: SandboxStreamRunner,
) {
	const abortController = new AbortController();
	let abortListenerAttached = false;
	let abortNotified = false;
	let closed = false;
	let sentDone = false;
	let bufferedDone = false;
	let stdoutMode: "sse" | "json" | null = null;
	let stdoutBuffer = "";
	let controller: SandboxStreamController | null = null;

	const encoder = new TextEncoder();

	const enqueueText = (text: string) => {
		if (!controller || closed || text.length === 0) {
			return;
		}
		controller.enqueue(encoder.encode(text));
	};

	const enqueueEvent = (data: unknown) => {
		enqueueText(`data: ${JSON.stringify(data)}\n\n`);
	};

	const detectStdoutMode = () => {
		if (stdoutMode) {
			return;
		}
		const trimmed = stdoutBuffer.trimStart();
		if (!trimmed) {
			return;
		}
		stdoutMode = trimmed.startsWith("data:") ? "sse" : "json";
	};

	const flushStdoutBufferAsSse = () => {
		let separatorIndex = stdoutBuffer.indexOf("\n\n");
		while (separatorIndex !== -1) {
			const event = stdoutBuffer.slice(0, separatorIndex);
			stdoutBuffer = stdoutBuffer.slice(separatorIndex + 2);
			if (event.trim() === "data: [DONE]") {
				bufferedDone = true;
			} else {
				enqueueText(`${event}\n\n`);
			}
			separatorIndex = stdoutBuffer.indexOf("\n\n");
		}
	};

	const flushStdoutBufferAsJson = () => {
		stdoutBuffer = stdoutBuffer.replace(/\r\n/g, "\n");
		let newlineIndex = stdoutBuffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const line = stdoutBuffer.slice(0, newlineIndex).trim();
			stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
			if (line.length > 0) {
				enqueueText(`data: ${line}\n\n`);
			}
			newlineIndex = stdoutBuffer.indexOf("\n");
		}
	};

	const flushStdoutBuffer = () => {
		detectStdoutMode();
		if (stdoutMode === "json") {
			flushStdoutBufferAsJson();
			return;
		}
		if (stdoutMode === "sse") {
			flushStdoutBufferAsSse();
		}
	};

	const sendDone = () => {
		if (sentDone) {
			return;
		}
		sentDone = true;
		enqueueText("data: [DONE]\n\n");
	};

	const closeStream = () => {
		if (closed) {
			return;
		}
		closed = true;
		const active = controller as { close?: () => void } | null;
		active?.close?.();
	};

	const onAbort = () => {
		if (!abortController.signal.aborted) {
			try {
				abortController.abort();
			} catch (error) {
				if (!(error instanceof DOMException && error.name === "AbortError")) {
					throw error;
				}
			}
		}
		if (!abortNotified) {
			abortNotified = true;
			enqueueEvent({ type: "abort" });
		}
	};

	const detachAbortListener = () => {
		if (abortListenerAttached) {
			req.signal.removeEventListener("abort", onAbort);
			abortListenerAttached = false;
		}
	};

	if (req.signal.aborted) {
		onAbort();
	} else {
		req.signal.addEventListener("abort", onAbort);
		abortListenerAttached = true;
	}

	const stdout = new Writable({
		write(chunk, _encoding, callback) {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			stdoutBuffer += text;
			flushStdoutBuffer();
			callback();
		},
	});

	const stderr = new Writable({
		write(chunk, _encoding, callback) {
			if (sentDone) {
				callback();
				return;
			}
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			enqueueEvent({
				type: "data-stderr",
				data: { text },
				transient: true,
			});
			callback();
		},
	});

	const stream = new ReadableStream<Uint8Array>({
		start(controllerParam) {
			controller = controllerParam;
			if (abortController.signal.aborted && !abortNotified) {
				abortNotified = true;
				enqueueEvent({ type: "abort" });
			}
		},
		cancel() {
			onAbort();
		},
	});

	(async () => {
		try {
			const result = await runSandbox({
				stdout,
				stderr,
				signal: abortController.signal,
			});
			const exitCode = resolveExitCode(result) ?? 0;
			flushStdoutBuffer();
			if (!abortController.signal.aborted) {
				enqueueEvent({
					type: "data-exit",
					data: { code: exitCode },
					transient: true,
				});
			}
		} catch (error) {
			flushStdoutBuffer();
			if (!abortController.signal.aborted) {
				const message = error instanceof Error ? error.message : String(error);
				enqueueEvent({ type: "error", errorText: message });
			} else if (!abortNotified) {
				abortNotified = true;
				enqueueEvent({ type: "abort" });
			}
		} finally {
			detectStdoutMode();
			if (stdoutBuffer.length > 0) {
				if (stdoutMode === "json") {
					const line = stdoutBuffer.trim();
					if (line.length > 0) {
						enqueueText(`data: ${line}\n\n`);
					}
				} else {
					enqueueText(stdoutBuffer);
				}
				stdoutBuffer = "";
			}
			if (bufferedDone || stdoutMode === "json") {
				sendDone();
			}
			closeStream();
			detachAbortListener();
		}
	})().catch(() => {
		closeStream();
		detachAbortListener();
	});

	return new Response(stream, {
		headers: new Headers(UI_MESSAGE_STREAM_HEADERS),
	});
}
