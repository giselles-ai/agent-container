import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type UIMessage,
	type UIMessageStreamWriter,
} from "ai";

const fallbackText =
	"Today we stream a longer message in chunks so the SSE client can render partial output as it arrives. This is useful for progress logs, summaries, or any output that benefits from incremental updates. Each chunk is printed with a short delay to simulate work being done inside the sandbox. Adjust the chunk size or delay to match your UX needs.";

function extractLatestUserText(
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

async function createSandboxStreamResponse(
	req: Request,
	inputText?: string | null,
) {
	const sandbox = await Sandbox.create();
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
				const result = await sandbox.runCommand({
					cmd: "node",
					args: [
						"-e",
						"const text = process.env.LONG_TEXT ?? ''; const size = 120; let i = 0; const interval = setInterval(() => { if (i >= text.length) { clearInterval(interval); return; } console.log(text.slice(i, i + size)); i += size; }, 200);",
					],
					env: {
						LONG_TEXT: inputText
							? `You said: ${inputText}\n\n${fallbackText}`
							: fallbackText,
					},
					stdout,
					stderr,
					signal: abortController.signal,
				});

				endText();
				writer.write({
					type: "data-exit",
					data: { code: result.exitCode ?? 0 },
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

export async function GET(req: Request) {
	return createSandboxStreamResponse(req, null);
}

export async function POST(req: Request) {
	const body = (await req.json().catch(() => null)) as {
		messages?: UIMessage[];
	} | null;
	const inputText = extractLatestUserText(body?.messages);
	return createSandboxStreamResponse(req, inputText);
}
