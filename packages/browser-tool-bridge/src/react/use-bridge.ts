"use client";

import type { RpaAction, SnapshotField } from "@giselles/browser-tool-sdk";
import { execute, snapshot } from "@giselles/browser-tool-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BridgeSession = {
	sessionId: string;
	token: string;
	expiresAt: number;
};

export type BridgeMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

type StreamEvent = {
	type?: string;
	[key: string]: unknown;
};

type ToolEvent = {
	id: string;
	toolId: string;
	toolName: string;
	status?: "success" | "error";
	parameters?: unknown;
	output?: unknown;
};

type ChatStatus = "ready" | "streaming";

export type BridgeStatus =
	| "connecting"
	| "connected"
	| "disconnected"
	| "error";

export type UseBridgeOptions = {
	endpoint: string;
};

export type BridgeHookState = {
	status: BridgeStatus;
	chatStatus: ChatStatus;
	messages: BridgeMessage[];
	tools: ToolEvent[];
	warnings: string[];
	stderrLogs: string[];
	sandboxId: string | null;
	geminiSessionId: string | null;
	session: BridgeSession | null;
	error: string | null;
	sendMessage: (input: { message: string; document?: string }) => Promise<void>;
};

export type UseBridgeState = BridgeHookState;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function extractWarnings(value: unknown): string[] {
	if (!isRecord(value) || !Array.isArray(value.warnings)) {
		return [];
	}

	return value.warnings.filter(
		(warning): warning is string => typeof warning === "string",
	);
}

function extractJsonObjects(buffer: string): {
	objects: string[];
	rest: string;
} {
	const objects: string[] = [];
	let depth = 0;
	let inString = false;
	let escaped = false;
	let startIndex = -1;

	for (let index = 0; index < buffer.length; index += 1) {
		const char = buffer[index];

		if (escaped) {
			escaped = false;
			continue;
		}

		if (char === "\\") {
			escaped = true;
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
				startIndex = index;
			}
			depth += 1;
			continue;
		}

		if (char === "}") {
			depth -= 1;
			if (depth === 0 && startIndex >= 0) {
				objects.push(buffer.slice(startIndex, index + 1));
				startIndex = -1;
			}
		}
	}

	if (depth > 0 && startIndex >= 0) {
		return {
			objects,
			rest: buffer.slice(startIndex),
		};
	}

	return {
		objects,
		rest: "",
	};
}

function dedupeStringArray(next: string[]): string[] {
	const nextSet = new Set(next);
	return Array.from(nextSet);
}

export function useBridge({ endpoint }: UseBridgeOptions): BridgeHookState {
	const [status, setStatus] = useState<BridgeStatus>("disconnected");
	const [chatStatus, setChatStatus] = useState<ChatStatus>("ready");
	const [session, setSession] = useState<BridgeSession | null>(null);
	const [messages, setMessages] = useState<BridgeMessage[]>([]);
	const [tools, setTools] = useState<ToolEvent[]>([]);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [stderrLogs, setStderrLogs] = useState<string[]>([]);
	const [sandboxId, setSandboxId] = useState<string | null>(null);
	const [geminiSessionId, setGeminiSessionId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const normalizedEndpoint = useMemo(
		() => endpoint.replace(/\/+$/, ""),
		[endpoint],
	);
	const bridgeBaseCandidates = useMemo(() => {
		const candidates = [normalizedEndpoint];
		if (!normalizedEndpoint.endsWith("/bridge")) {
			candidates.push(`${normalizedEndpoint}/bridge`);
		}
		return Array.from(new Set(candidates));
	}, [normalizedEndpoint]);
	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = useRef(true);
	const sessionRef = useRef<BridgeSession | null>(null);
	const bridgeBaseRef = useRef<string | null>(null);
	const messagesAssistantId = useRef<string | null>(null);
	const assistantBufferRef = useRef("");

	const cleanupBridge = useCallback(() => {
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}

		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
	}, []);

	const handleBridgeResponse = useCallback(
		async (payload: Record<string, unknown>) => {
			const currentSession = sessionRef.current;
			const currentBridgeBase = bridgeBaseRef.current;
			if (!currentSession) {
				return;
			}
			if (!currentBridgeBase) {
				return;
			}

			await fetch(`${currentBridgeBase}/respond`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					sessionId: currentSession.sessionId,
					token: currentSession.token,
					response: payload,
				}),
			});
		},
		[],
	);

	const handleBridgeEvent = useCallback(
		async (event: unknown) => {
			if (!isRecord(event) || typeof event.type !== "string") {
				return;
			}

			if (event.type === "ready") {
				return;
			}

			const requestId = asString(event.requestId);
			if (!requestId) {
				return;
			}

			try {
				if (event.type === "error_response") {
					const message = asString(event.message);
					if (message) {
						setError(message);
					}

					return;
				}

				if (event.type === "snapshot_request") {
					const fields = snapshot();
					await handleBridgeResponse({
						type: "snapshot_response",
						requestId,
						fields,
					});
					return;
				}

				if (event.type === "execute_request") {
					const actions = Array.isArray(event.actions)
						? (event.actions as RpaAction[])
						: [];
					const fields = Array.isArray(event.fields)
						? (event.fields as SnapshotField[])
						: [];

					const report = execute(actions, fields);
					setWarnings((current) =>
						dedupeStringArray([...current, ...report.warnings]),
					);

					await handleBridgeResponse({
						type: "execute_response",
						requestId,
						report,
					});
					return;
				}

				await handleBridgeResponse({
					type: "error_response",
					requestId,
					message: `Unsupported bridge request type: ${event.type}`,
				});
			} catch (bridgeError) {
				const message =
					bridgeError instanceof Error
						? bridgeError.message
						: "Bridge execution failed.";
				setError(message);
				await handleBridgeResponse({
					type: "error_response",
					requestId,
					message,
				});
			}
		},
		[handleBridgeResponse],
	);

	const connect = useCallback(() => {
		const currentBridgeBase = bridgeBaseRef.current;
		const currentSession = sessionRef.current;
		if (!currentSession || !currentBridgeBase) {
			return;
		}

		const source = new EventSource(
			`${currentBridgeBase}/events?sessionId=${encodeURIComponent(currentSession.sessionId)}&token=${encodeURIComponent(currentSession.token)}`,
		);
		eventSourceRef.current = source;
		setStatus("connecting");

		source.onopen = () => {
			if (!mountedRef.current) {
				return;
			}
			setStatus("connected");
		};

		source.onmessage = (message) => {
			try {
				const payload = JSON.parse(message.data) as unknown;
				void handleBridgeEvent(payload);
			} catch {
				// Ignore malformed bridge events.
			}
		};

		source.onerror = () => {
			if (!mountedRef.current) {
				return;
			}

			setStatus("disconnected");
			if (!reconnectTimerRef.current) {
				reconnectTimerRef.current = setTimeout(() => {
					reconnectTimerRef.current = null;
					connect();
				}, 1500);
			}
		};
	}, [handleBridgeEvent]);

	useEffect(() => {
		mountedRef.current = true;
		const abortController = new AbortController();

		const initialize = async () => {
			setStatus("connecting");
			setError(null);

			try {
				let latestError: Error | null = null;
				let selectedBase: string | null = null;
				let payload: BridgeSession | null = null;

				for (const candidate of bridgeBaseCandidates) {
					try {
						const response = await fetch(`${candidate}/session`, {
							method: "POST",
							signal: abortController.signal,
						});

						if (!response.ok) {
							latestError = new Error(
								`Failed to create bridge session (${response.status}).`,
							);
							continue;
						}

						payload = (await response.json()) as BridgeSession;
						selectedBase = candidate;
						latestError = null;
						break;
					} catch (candidateError) {
						latestError =
							candidateError instanceof Error
								? candidateError
								: new Error("Failed to initialize bridge session.");
					}
				}

				if (!selectedBase || !payload) {
					throw latestError ?? new Error("Failed to create bridge session.");
				}

				bridgeBaseRef.current = selectedBase;

				if (!mountedRef.current) {
					return;
				}

				const nextSession = {
					sessionId: payload.sessionId,
					token: payload.token,
					expiresAt: payload.expiresAt,
				};

				sessionRef.current = nextSession;
				setSession(nextSession);
				connect();
			} catch (nextError) {
				if (!mountedRef.current || abortController.signal.aborted) {
					return;
				}

				setStatus("error");
				setError(
					nextError instanceof Error
						? nextError.message
						: "Failed to initialize bridge.",
				);
			}
		};

		void initialize();

		return () => {
			mountedRef.current = false;
			abortController.abort();
			cleanupBridge();
		};
	}, [bridgeBaseCandidates, cleanupBridge, connect]);

	const handleStreamEvent = useCallback((event: StreamEvent) => {
		if (typeof event.type !== "string") {
			return;
		}

		if (event.type === "sandbox") {
			const nextSandboxId = asString(event.sandbox_id);
			if (nextSandboxId) {
				setSandboxId(nextSandboxId);
			}
			return;
		}

		if (event.type === "init") {
			const nextSessionId = asString(event.session_id);
			if (nextSessionId) {
				setGeminiSessionId(nextSessionId);
			}
			return;
		}

		if (event.type === "stderr") {
			const text = asString(event.content);
			if (text) {
				setStderrLogs((current) => [...current, text]);
			}
			return;
		}

		if (event.type === "message") {
			const role = asString(event.role);
			const content = asString(event.content) ?? "";
			const isDelta = Boolean(event.delta);

			if (role === "assistant") {
				if (isDelta) {
					const currentId = messagesAssistantId.current;
					if (!currentId) {
						const nextId = crypto.randomUUID();
						messagesAssistantId.current = nextId;
						assistantBufferRef.current = content;
						setMessages((current) => [
							...current,
							{ id: nextId, role: "assistant", content },
						]);
						return;
					}

					const merged = `${assistantBufferRef.current}${content}`;
					assistantBufferRef.current = merged;
					setMessages((current) =>
						current.map((message) =>
							message.id === currentId
								? { ...message, content: merged }
								: message,
						),
					);
					return;
				}

				if (content.trim().length > 0) {
					const nextId = crypto.randomUUID();
					messagesAssistantId.current = nextId;
					assistantBufferRef.current = content;
					setMessages((current) => [
						...current,
						{ id: nextId, role: "assistant", content },
					]);
				}

				return;
			}

			if (role === "user" && content.trim().length > 0) {
				setMessages((current) => {
					const last = current[current.length - 1];
					if (last && last.role === "user" && last.content === content) {
						return current;
					}

					return [
						...current,
						{ id: crypto.randomUUID(), role: "user", content },
					];
				});
			}

			return;
		}

		if (event.type === "tool_use") {
			const toolId = asString(event.tool_id) ?? crypto.randomUUID();
			const toolName = asString(event.tool_name) ?? "tool";

			setTools((current) => [
				...current,
				{
					id: crypto.randomUUID(),
					toolId,
					toolName,
					parameters: event.parameters,
				},
			]);
			return;
		}

		if (event.type === "tool_result") {
			const toolId = asString(event.tool_id);
			if (!toolId) {
				return;
			}

			const status = asString(event.status);
			const nextStatus =
				status === "success" || status === "error" ? status : undefined;

			setTools((current) =>
				current.map((tool) =>
					tool.toolId === toolId
						? {
								...tool,
								status: nextStatus,
								output: event.output,
							}
						: tool,
				),
			);

			const parsedWarnings = extractWarnings(event.output);
			if (parsedWarnings.length > 0) {
				setWarnings((current) =>
					dedupeStringArray([...current, ...parsedWarnings]),
				);
			}
			return;
		}

		if (event.type === "result") {
			setChatStatus("ready");
		}
	}, []);

	const sendMessage = useCallback(
		async ({ message, document }: { message: string; document?: string }) => {
			const trimmedMessage = message.trim();
			const currentSession = sessionRef.current;
			const currentBridgeBase = bridgeBaseRef.current;

			if (!currentSession) {
				const nextError = "Bridge session is not initialized yet.";
				setError(nextError);
				throw new Error(nextError);
			}

			if (!currentBridgeBase) {
				const nextError = "Bridge base endpoint is not initialized yet.";
				setError(nextError);
				throw new Error(nextError);
			}

			if (status !== "connected") {
				const nextError =
					"Bridge is disconnected. Reload the page and reconnect.";
				setError(nextError);
				throw new Error(nextError);
			}

			if (!trimmedMessage || chatStatus === "streaming") {
				return;
			}

			setError(null);
			setChatStatus("streaming");
			assistantBufferRef.current = "";
			messagesAssistantId.current = null;
			setMessages((current) => [
				...current,
				{ id: crypto.randomUUID(), role: "user", content: trimmedMessage },
			]);

			const response = await fetch(`${currentBridgeBase}/chat`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					message: document?.trim()
						? `${trimmedMessage}\n\nDocument:\n${document.trim()}`
						: trimmedMessage,
					session_id: undefined,
					sandbox_id: sandboxId ?? undefined,
					bridge_session_id: currentSession.sessionId,
					bridge_token: currentSession.token,
				}),
			});

			if (!response.ok || !response.body) {
				const nextError = `Failed to start stream (${response.status}).`;
				setError(nextError);
				setChatStatus("ready");
				throw new Error(nextError);
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}

					buffer += decoder.decode(value, { stream: true });
					const parsed = extractJsonObjects(buffer);
					buffer = parsed.rest;

					for (const objectText of parsed.objects) {
						try {
							const parsedEvent = JSON.parse(objectText) as StreamEvent;
							handleStreamEvent(parsedEvent);
						} catch {
							// Ignore malformed chunk.
						}
					}
				}

				if (buffer.trim().length > 0) {
					try {
						const parsedEvent = JSON.parse(buffer) as StreamEvent;
						handleStreamEvent(parsedEvent);
					} catch {
						// Ignore trailing partial buffer.
					}
				}
			} finally {
				setChatStatus("ready");
			}
		},
		[chatStatus, handleStreamEvent, sandboxId, status],
	);

	return {
		status,
		chatStatus,
		messages,
		tools,
		warnings,
		stderrLogs,
		sandboxId,
		geminiSessionId,
		session,
		error,
		sendMessage,
	};
}
