"use client";

import { use, useCallback, useMemo, useRef, useState } from "react";

type UploadedFile = {
	name: string;
	type: string;
	size: number;
	pathname: string;
	url: string;
};

type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

type StreamStats = {
	total_tokens: number;
	input_tokens: number;
	output_tokens: number;
	cached: number;
	input: number;
	duration_ms: number;
	tool_calls: number;
};

type Props = {
	params: Promise<{ slug: string }>;
};

type StreamEvent =
	| {
			type: "init";
			timestamp: string;
			session_id: string;
			model: string;
	  }
	| {
			type: "sandbox";
			sandbox_id: string;
	  }
	| {
			type: "stderr";
			content: string;
	  }
	| {
			type: "message";
			timestamp: string;
			role: "user" | "assistant";
			content: string;
			delta?: boolean;
	  }
	| {
			type: "result";
			timestamp: string;
			status: "success";
			stats: StreamStats;
	  };

const extractJsonObjects = (buffer: string) => {
	const objects: string[] = [];
	let depth = 0;
	let inString = false;
	let isEscaped = false;
	let startIndex = -1;

	for (let i = 0; i < buffer.length; i += 1) {
		const char = buffer[i];
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (char === "\\") {
			isEscaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (char === "{") {
			if (depth === 0) {
				startIndex = i;
			}
			depth += 1;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0 && startIndex >= 0) {
				objects.push(buffer.slice(startIndex, i + 1));
				startIndex = -1;
			}
		}
	}

	const rest =
		depth === 0 ? "" : buffer.slice(startIndex >= 0 ? startIndex : 0);
	return { objects, rest };
};

const createMessage = (
	role: "user" | "assistant",
	content: string,
): ChatMessage => ({
	id: crypto.randomUUID(),
	role,
	content,
});

export default function AgentChatPage(props: Props) {
	const params = use(props.params);
	const [input, setInput] = useState("");
	const [attachments, setAttachments] = useState<File[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
	const [error, setError] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [sandboxId, setSandboxId] = useState<string | null>(null);
	const [stats, setStats] = useState<StreamStats | null>(null);
	const [model, setModel] = useState<string | null>(null);
	const [stderrLines, setStderrLines] = useState<string[]>([]);

	const messagesRef = useRef<ChatMessage[]>([]);
	const assistantIdRef = useRef<string | null>(null);
	const assistantContentRef = useRef<string>("");
	const abortRef = useRef<AbortController | null>(null);

	const endpoint = useMemo(
		() => `/agents/${params.slug}/chat/api`,
		[params.slug],
	);
	const uploadEndpoint = useMemo(
		() => `/agents/${params.slug}/chat/api/upload`,
		[params.slug],
	);

	const syncMessages = useCallback(() => {
		setMessages([...messagesRef.current]);
	}, []);

	const appendMessage = useCallback(
		(message: ChatMessage) => {
			messagesRef.current = [...messagesRef.current, message];
			syncMessages();
		},
		[syncMessages],
	);

	const appendAssistantDelta = useCallback(
		(delta: string) => {
			let assistantId = assistantIdRef.current;
			const nextContent = `${assistantContentRef.current}${delta}`;
			assistantContentRef.current = nextContent;

			if (!assistantId) {
				const next = createMessage("assistant", nextContent);
				assistantId = next.id;
				assistantIdRef.current = assistantId;
				messagesRef.current = [...messagesRef.current, next];
			} else {
				messagesRef.current = messagesRef.current.map((message) =>
					message.id === assistantId
						? { ...message, content: nextContent }
						: message,
				);
			}
			syncMessages();
		},
		[syncMessages],
	);

	const handleStreamEvent = useCallback(
		(event: StreamEvent) => {
			if (event.type === "init") {
				setSessionId(event.session_id);
				setModel(event.model);
				return;
			}
			if (event.type === "sandbox") {
				setSandboxId(event.sandbox_id);
				return;
			}
			if (event.type === "stderr") {
				setStderrLines((prev) => [...prev, event.content]);
				return;
			}
			if (event.type === "message") {
				if (event.role === "user") {
					const last = messagesRef.current[messagesRef.current.length - 1];
					if (!last || last.role !== "user" || last.content !== event.content) {
						appendMessage(createMessage("user", event.content));
					}
					return;
				}
				if (event.role === "assistant") {
					appendAssistantDelta(event.content);
				}
				return;
			}
			if (event.type === "result") {
				setStats(event.stats);
			}
		},
		[appendAssistantDelta, appendMessage],
	);

	const streamResponse = useCallback(
		async (message: string, files?: UploadedFile[]) => {
			assistantIdRef.current = null;
			assistantContentRef.current = "";
			const controller = new AbortController();
			abortRef.current = controller;
			setStats(null);

			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					message,
					session_id: sessionId,
					sandbox_id: sandboxId,
					files,
				}),
				signal: controller.signal,
			});

			if (!response.ok || !response.body) {
				throw new Error("Failed to connect to stream.");
			}

			try {
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const { objects, rest } = extractJsonObjects(buffer);
					buffer = rest;
					for (const json of objects) {
						try {
							const payload = JSON.parse(json) as StreamEvent;
							handleStreamEvent(payload);
						} catch {
							// Ignore malformed chunks.
						}
					}
				}
				if (buffer.trim().length > 0) {
					try {
						const payload = JSON.parse(buffer) as StreamEvent;
						handleStreamEvent(payload);
					} catch {
						// Ignore trailing partial buffer.
					}
				}
				setStatus("idle");
			} catch (streamError) {
				if ((streamError as Error).name !== "AbortError") {
					setError(
						streamError instanceof Error ? streamError.message : "Stream error",
					);
					setStatus("error");
				} else {
					setStatus("idle");
				}
			} finally {
				abortRef.current = null;
			}
		},
		[endpoint, handleStreamEvent, sessionId, sandboxId],
	);

	const uploadFiles = useCallback(
		async (files: File[]) => {
			const formData = new FormData();
			for (const file of files) {
				formData.append("files", file);
			}
			const response = await fetch(uploadEndpoint, {
				method: "POST",
				body: formData,
			});
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as
					| { error?: string }
					| null;
				throw new Error(payload?.error ?? "Upload failed.");
			}
			const payload = (await response.json()) as {
				files: UploadedFile[];
			};
			return payload.files ?? [];
		},
		[uploadEndpoint],
	);

	const handleSubmit = useCallback(
		async (event: React.SyntheticEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmed = input.trim();
			if (!trimmed || status === "streaming" || isUploading) {
				return;
			}
			setInput("");
			setError(null);
			setStderrLines([]);
			appendMessage(createMessage("user", trimmed));
			let uploaded: UploadedFile[] | undefined;
			try {
				if (attachments.length > 0) {
					setIsUploading(true);
					uploaded = await uploadFiles(attachments);
				}
				setAttachments([]);
				setStatus("streaming");
				void streamResponse(trimmed, uploaded);
			} catch (uploadError) {
				setError(
					uploadError instanceof Error
						? uploadError.message
						: "Upload failed.",
				);
				setStatus("error");
			} finally {
				setIsUploading(false);
			}
		},
		[
			appendMessage,
			attachments,
			input,
			isUploading,
			status,
			streamResponse,
			uploadFiles,
		],
	);

	const handleStop = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
		setStatus("idle");
	}, []);

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100">
			<div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8">
				<header className="mb-6">
					<p className="text-xs uppercase tracking-[0.3em] text-slate-400">
						Gemini CLI
					</p>
					<h1 className="mt-2 text-3xl font-semibold text-slate-50">
						Chat with {params.slug}
					</h1>
					<p className="mt-2 text-sm text-slate-400">
						Streamed JSON events over NDJSON (mocked Gemini CLI).
					</p>
				</header>

				<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
					<section className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
						<div className="flex items-center justify-between border-b border-slate-800 pb-3">
							<div>
								<p className="text-sm font-medium">Conversation</p>
								<p className="text-xs text-slate-400">
									Status: {status}
									{status === "streaming" ? " • Replying..." : ""}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={handleStop}
									disabled={status !== "streaming"}
									className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
								>
									Stop
								</button>
							</div>
						</div>

						<div className="mt-4 flex-1 space-y-4 overflow-y-auto">
							{messages.length === 0 ? (
								<p className="text-sm text-slate-500">
									Type a message to start streaming.
								</p>
							) : (
								messages.map((message) => (
									<div
										key={message.id}
										className={`rounded-xl border px-4 py-3 text-sm ${
											message.role === "user"
												? "border-slate-700 bg-slate-800/60"
												: "border-emerald-500/40 bg-emerald-500/10"
										}`}
									>
										<p className="text-xs uppercase tracking-wide text-slate-400">
											{message.role}
										</p>
										<p className="mt-2 whitespace-pre-wrap text-slate-100">
											{message.content || "..."}
										</p>
									</div>
								))
							)}
						</div>

						<form onSubmit={handleSubmit} className="mt-4 space-y-3">
							<div className="flex items-center gap-2">
								<label className="cursor-pointer rounded-full border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-slate-500">
									<input
										type="file"
										multiple
										className="hidden"
										onChange={(event) => {
											const next = Array.from(event.target.files ?? []);
											setAttachments(next);
											event.currentTarget.value = "";
										}}
									/>
									Attach
								</label>
								<input
									value={input}
									onChange={(event) => setInput(event.target.value)}
									placeholder="Send a message..."
									className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
								/>
								<button
									type="submit"
									disabled={
										!input.trim() || status === "streaming" || isUploading
									}
									className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{isUploading ? "Uploading..." : "Send"}
								</button>
							</div>
							{attachments.length > 0 ? (
								<div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
									{attachments.map((file, index) => (
										<div
											key={`${file.name}-${file.size}-${index}`}
											className="flex items-center justify-between gap-2"
										>
											<p className="truncate">
												{file.name} ({Math.round(file.size / 1024)} KB)
											</p>
											<button
												type="button"
												onClick={() =>
													setAttachments((prev) =>
														prev.filter((_, itemIndex) => itemIndex !== index),
													)
												}
												className="text-rose-300 transition hover:text-rose-200"
											>
												Remove
											</button>
										</div>
									))}
								</div>
							) : null}
						</form>
						{error ? (
							<p className="mt-2 text-xs text-rose-400">{error}</p>
						) : null}
					</section>

					<aside className="flex flex-col gap-4">
						<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-sm font-medium">Session</p>
							<p className="mt-2 text-xs text-slate-400">
								ID: {sessionId ?? "—"}
							</p>
							<p className="mt-1 text-xs text-slate-400">
								Sandbox: {sandboxId ?? "—"}
							</p>
							<p className="mt-1 text-xs text-slate-400">
								Model: {model ?? "—"}
							</p>
						</div>
						<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-sm font-medium">stderr</p>
							<div className="mt-2 space-y-2 text-xs text-amber-300">
								{stderrLines.length === 0 ? (
									<p className="text-slate-500">No stderr yet.</p>
								) : (
									stderrLines.map((line, index) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: stderr lines are append-only
										<p key={index} className="whitespace-pre-wrap">
											{line}
										</p>
									))
								)}
							</div>
						</div>
						<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-sm font-medium">Result stats</p>
							{stats ? (
								<div className="mt-2 text-xs text-slate-300">
									<p>Total tokens: {stats.total_tokens}</p>
									<p>Input tokens: {stats.input_tokens}</p>
									<p>Output tokens: {stats.output_tokens}</p>
									<p>Duration: {stats.duration_ms} ms</p>
									<p>Messages: {messages.length} </p>
								</div>
							) : (
								<p className="mt-2 text-xs text-slate-500">
									Waiting for result...
								</p>
							)}
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}
