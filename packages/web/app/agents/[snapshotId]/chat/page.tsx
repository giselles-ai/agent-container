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

type ToolCard = {
	id: string;
	toolId: string;
	toolName: string;
	status?: "success" | "error";
	parameters?: unknown;
	output?: unknown;
	timestamp?: string;
};

type ChatItem =
	| {
			type: "message";
			message: ChatMessage;
	  }
	| {
			type: "tool";
			tool: ToolCard;
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
			type: "tool_use";
			timestamp: string;
			tool_name: string;
			tool_id: string;
			parameters?: unknown;
	  }
	| {
			type: "tool_result";
			timestamp: string;
			tool_id: string;
			status: "success" | "error";
			output?: unknown;
	  }
	| {
			type: "artifact";
			timestamp?: string;
			path: string;
			status?: "success" | "error";
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

const createToolCard = (input: {
	toolId: string;
	toolName: string;
	status?: "success" | "error";
	parameters?: unknown;
	output?: unknown;
	timestamp?: string;
}): ToolCard => ({
	id: crypto.randomUUID(),
	toolId: input.toolId,
	toolName: input.toolName,
	status: input.status,
	parameters: input.parameters,
	output: input.output,
	timestamp: input.timestamp,
});

const formatToolDetail = (detail: unknown) => {
	if (detail === null || detail === undefined) return "—";
	if (typeof detail === "string") return detail;
	try {
		return JSON.stringify(detail, null, 2);
	} catch {
		return String(detail);
	}
};

export default function AgentChatPage(
	props: PageProps<"/agents/[snapshotId]/chat">,
) {
	const { snapshotId } = use(props.params);
	const [input, setInput] = useState("");
	const [attachments, setAttachments] = useState<File[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const [items, setItems] = useState<ChatItem[]>([]);
	const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
	const [error, setError] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [sandboxId, setSandboxId] = useState<string | null>(null);
	const [stats, setStats] = useState<StreamStats | null>(null);
	const [model, setModel] = useState<string | null>(null);
	const [stderrLines, setStderrLines] = useState<string[]>([]);
	const [fileArtifacts, setFileArtifacts] = useState<
		Array<{ path: string; status?: "success" | "error" }>
	>([]);
	const [isCreatingSkill, setIsCreatingSkill] = useState(false);
	const [createdSkill, setCreatedSkill] = useState<{
		slug: string;
		name: string;
		description: string;
	} | null>(null);
	const [createSkillError, setCreateSkillError] = useState<string | null>(null);

	const itemsRef = useRef<ChatItem[]>([]);
	const assistantIdRef = useRef<string | null>(null);
	const assistantContentRef = useRef<string>("");
	const abortRef = useRef<AbortController | null>(null);
	const toolIdToItemIdRef = useRef<Map<string, string>>(new Map());
	const fileArtifactsRef = useRef<
		Map<string, { path: string; status?: "success" | "error" }>
	>(new Map());

	const endpoint = useMemo(
		() => `/agents/${snapshotId}/chat/api`,
		[snapshotId],
	);
	const uploadEndpoint = useMemo(
		() => `/agents/${snapshotId}/chat/api/upload`,
		[snapshotId],
	);
	const createSkillEndpoint = useMemo(
		() => `/agents/${snapshotId}/chat/api/create-skill`,
		[snapshotId],
	);

	const syncItems = useCallback(() => {
		setItems([...itemsRef.current]);
	}, []);

	const appendMessage = useCallback(
		(message: ChatMessage) => {
			itemsRef.current = [...itemsRef.current, { type: "message", message }];
			syncItems();
		},
		[syncItems],
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
				itemsRef.current = [
					...itemsRef.current,
					{ type: "message", message: next },
				];
			} else {
				itemsRef.current = itemsRef.current.map((item) => {
					if (item.type !== "message") return item;
					if (item.message.id !== assistantId) return item;
					return {
						type: "message",
						message: { ...item.message, content: nextContent },
					};
				});
			}
			syncItems();
		},
		[syncItems],
	);

	const appendToolCard = useCallback(
		(tool: ToolCard) => {
			itemsRef.current = [...itemsRef.current, { type: "tool", tool }];
			syncItems();
		},
		[syncItems],
	);

	const updateToolCard = useCallback(
		(toolId: string, update: Partial<ToolCard>) => {
			itemsRef.current = itemsRef.current.map((item) => {
				if (item.type !== "tool") return item;
				if (item.tool.toolId !== toolId) return item;
				return { type: "tool", tool: { ...item.tool, ...update } };
			});
			syncItems();
		},
		[syncItems],
	);

	const recordFileArtifact = useCallback(
		(path: string, status?: "success" | "error") => {
			const map = fileArtifactsRef.current;
			const existing = map.get(path);
			const next = { path, status: status ?? existing?.status };
			map.set(path, next);
			setFileArtifacts(Array.from(map.values()));
		},
		[],
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
					const lastMessage = [...itemsRef.current]
						.reverse()
						.find((item) => item.type === "message")?.message;
					if (
						!lastMessage ||
						lastMessage.role !== "user" ||
						lastMessage.content !== event.content
					) {
						appendMessage(createMessage("user", event.content));
					}
					return;
				}
				if (event.role === "assistant") {
					appendAssistantDelta(event.content);
				}
				return;
			}
			if (event.type === "tool_use") {
				const toolCard = createToolCard({
					toolId: event.tool_id,
					toolName: event.tool_name,
					parameters: event.parameters,
					timestamp: event.timestamp,
				});
				toolIdToItemIdRef.current.set(event.tool_id, toolCard.id);
				appendToolCard(toolCard);
				if (event.tool_name === "write_file") {
					const filePath =
						typeof event.parameters === "object" &&
						event.parameters !== null &&
						"file_path" in event.parameters
							? String((event.parameters as { file_path?: unknown }).file_path)
							: null;
					if (filePath && filePath.trim().length > 0) {
						recordFileArtifact(filePath);
					}
				}
				return;
			}
			if (event.type === "tool_result") {
				const hasExisting = toolIdToItemIdRef.current.has(event.tool_id);
				if (!hasExisting) {
					const toolCard = createToolCard({
						toolId: event.tool_id,
						toolName: "tool",
						status: event.status,
						output: event.output,
						timestamp: event.timestamp,
					});
					toolIdToItemIdRef.current.set(event.tool_id, toolCard.id);
					appendToolCard(toolCard);
				} else {
					updateToolCard(event.tool_id, {
						status: event.status,
						output: event.output,
						timestamp: event.timestamp,
					});
				}
				if (event.status) {
					const toolItem = itemsRef.current.find(
						(item) =>
							item.type === "tool" && item.tool.toolId === event.tool_id,
					);
					if (
						toolItem &&
						toolItem.type === "tool" &&
						toolItem.tool.toolName === "write_file"
					) {
						const filePath =
							typeof toolItem.tool.parameters === "object" &&
							toolItem.tool.parameters !== null &&
							"file_path" in toolItem.tool.parameters
								? String(
										(toolItem.tool.parameters as { file_path?: unknown })
											.file_path,
									)
								: null;
						if (filePath && filePath.trim().length > 0) {
							recordFileArtifact(filePath, event.status);
						}
					}
				}
				return;
			}
			if (event.type === "artifact") {
				if (event.path && event.path.trim().length > 0) {
					recordFileArtifact(event.path, event.status);
				}
				return;
			}
			if (event.type === "result") {
				setStats(event.stats);
			}
		},
		[
			appendAssistantDelta,
			appendMessage,
			appendToolCard,
			recordFileArtifact,
			updateToolCard,
		],
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
				const payload = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
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
			setFileArtifacts([]);
			fileArtifactsRef.current = new Map();
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
					uploadError instanceof Error ? uploadError.message : "Upload failed.",
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

	const canCreateSkill =
		status === "idle" &&
		items.length > 0 &&
		Boolean(sandboxId) &&
		Boolean(sessionId) &&
		!isCreatingSkill;

	const handleCreateSkill = useCallback(async () => {
		if (!canCreateSkill || !sandboxId || !sessionId) {
			return;
		}
		setIsCreatingSkill(true);
		setCreateSkillError(null);
		setCreatedSkill(null);
		try {
			const response = await fetch(createSkillEndpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sandboxId, sessionId }),
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				slug?: string;
				name?: string;
				description?: string;
			} | null;
			if (!response.ok) {
				throw new Error(payload?.error ?? "Failed to create skill.");
			}
			if (!payload?.slug || !payload?.name || !payload?.description) {
				throw new Error("Invalid skill response.");
			}
			setCreatedSkill({
				slug: payload.slug,
				name: payload.name,
				description: payload.description,
			});
		} catch (error) {
			setCreateSkillError(
				error instanceof Error ? error.message : "Failed to create skill.",
			);
		} finally {
			setIsCreatingSkill(false);
		}
	}, [canCreateSkill, createSkillEndpoint, sandboxId, sessionId]);

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100">
			<div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8">
				<header className="mb-6">
					<p className="text-xs uppercase tracking-[0.3em] text-slate-400">
						Gemini CLI
					</p>
					<h1 className="mt-2 text-3xl font-semibold text-slate-50">
						Chat with pptx Agent
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
							{items.length === 0 ? (
								<p className="text-sm text-slate-500">
									Type a message to start streaming.
								</p>
							) : (
								items.map((item) => {
									if (item.type === "message") {
										return (
											<div
												key={item.message.id}
												className={`rounded-xl border px-4 py-3 text-sm ${
													item.message.role === "user"
														? "border-slate-700 bg-slate-800/60"
														: "border-emerald-500/40 bg-emerald-500/10"
												}`}
											>
												<p className="text-xs uppercase tracking-wide text-slate-400">
													{item.message.role}
												</p>
												<p className="mt-2 whitespace-pre-wrap text-slate-100">
													{item.message.content || "..."}
												</p>
											</div>
										);
									}
									const statusLabel = item.tool.status ?? "pending";
									return (
										<div
											key={item.tool.id}
											className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-sm"
										>
											<div className="flex items-center justify-between">
												<p className="text-xs uppercase tracking-wide text-slate-400">
													tool
												</p>
												<p className="text-[11px] uppercase tracking-wider text-slate-400">
													{statusLabel}
												</p>
											</div>
											<p className="mt-2 text-sm font-medium text-slate-100">
												{item.tool.toolName}
											</p>
											<details className="mt-3 text-xs text-slate-300">
												<summary className="cursor-pointer select-none text-slate-400">
													View details
												</summary>
												<div className="mt-2 space-y-2">
													<div>
														<p className="text-[11px] uppercase tracking-wider text-slate-500">
															Parameters
														</p>
														<pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-900/70 p-2 text-[11px] text-slate-200">
															{formatToolDetail(item.tool.parameters)}
														</pre>
													</div>
													<div>
														<p className="text-[11px] uppercase tracking-wider text-slate-500">
															Output
														</p>
														<pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-900/70 p-2 text-[11px] text-slate-200">
															{formatToolDetail(item.tool.output)}
														</pre>
													</div>
												</div>
											</details>
										</div>
									);
								})
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
									<p>
										Messages:{" "}
										{items.filter((item) => item.type === "message").length}
									</p>
								</div>
							) : (
								<p className="mt-2 text-xs text-slate-500">
									Waiting for result...
								</p>
							)}
						</div>
						<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-sm font-medium">Create Skill from Chat</p>
							<p className="mt-2 text-xs text-slate-400">
								Generate and save a SKILL.md from this chat session.
							</p>
							<button
								type="button"
								onClick={() => void handleCreateSkill()}
								disabled={!canCreateSkill}
								className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{isCreatingSkill ? "Creating..." : "Create Skill from Chat"}
							</button>
							{createdSkill ? (
								<div className="mt-3 space-y-1 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-300">
									<p>
										<span className="text-slate-500">slug:</span>{" "}
										{createdSkill.slug}
									</p>
									<p>
										<span className="text-slate-500">name:</span>{" "}
										{createdSkill.name}
									</p>
									<p>
										<span className="text-slate-500">description:</span>{" "}
										{createdSkill.description}
									</p>
								</div>
							) : null}
							{createSkillError ? (
								<p className="mt-2 text-xs text-rose-400">{createSkillError}</p>
							) : null}
						</div>
						<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-sm font-medium">Created files</p>
							<div className="mt-2 space-y-2 text-xs text-slate-300">
								{fileArtifacts.length === 0 ? (
									<p className="text-slate-500">No files yet.</p>
								) : (
									fileArtifacts.map((file) => (
										<div
											key={file.path}
											className="flex items-center justify-between gap-2"
										>
											{sandboxId ? (
												<a
													href={`/agents/pptx/chat/api/sandbox/${encodeURIComponent(
														sandboxId,
													)}/artifact/${encodeURIComponent(file.path)}`}
													className="truncate text-emerald-300 transition hover:text-emerald-200"
												>
													{file.path}
												</a>
											) : (
												<span className="truncate text-slate-400">
													{file.path}
												</span>
											)}
											<span className="text-[11px] uppercase tracking-wider text-slate-500">
												{file.status ?? "pending"}
											</span>
										</div>
									))
								)}
							</div>
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}
