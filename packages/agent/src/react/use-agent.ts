"use client";

import type {
	BrowserToolAction,
	SnapshotField,
} from "@giselles-ai/browser-tool";
import { execute, snapshot } from "@giselles-ai/browser-tool/dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BridgeSession = {
	sessionId: string;
	token: string;
	expiresAt: number;
};

export type AgentMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

type StreamEvent = {
	type?: string;
	[key: string]: unknown;
};

export type ToolEvent = {
	id: string;
	toolId: string;
	toolName: string;
	status?: "success" | "error";
	parameters?: unknown;
	output?: unknown;
};

type BridgeStatus = "idle" | "connecting" | "connected" | "error";
export type AgentStatus = BridgeStatus | "running";

export type UseAgentOptions = {
	endpoint: string;
};

export type AgentHookState = {
	status: AgentStatus;
	messages: AgentMessage[];
	tools: ToolEvent[];
	warnings: string[];
	stderrLogs: string[];
	sandboxId: string | null;
	geminiSessionId: string | null;
	error: string | null;
	sendMessage: (input: { message: string; document?: string }) => Promise<void>;
};

const LOG_PREFIX = "[agent-bridge-client]";

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
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

export function useAgent({ endpoint }: UseAgentOptions): AgentHookState {
	const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("idle");
	const [running, setRunning] = useState(false);
	const [messages, setMessages] = useState<AgentMessage[]>([]);
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
	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = useRef(true);
	const sessionRef = useRef<BridgeSession | null>(null);
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
			if (!currentSession) {
				console.warn(`${LOG_PREFIX} respond.skip.no-session`, {
					payloadType: payload.type,
				});
				return;
			}

			const requestId =
				typeof payload.requestId === "string" ? payload.requestId : undefined;
			const responseType =
				typeof payload.type === "string" ? payload.type : undefined;
			console.info(`${LOG_PREFIX} respond.out`, {
				sessionId: currentSession.sessionId,
				requestId,
				responseType,
			});

			const response = await fetch(normalizedEndpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					type: "bridge.respond",
					sessionId: currentSession.sessionId,
					token: currentSession.token,
					response: payload,
				}),
			});
			console.info(`${LOG_PREFIX} respond.result`, {
				sessionId: currentSession.sessionId,
				requestId,
				status: response.status,
				ok: response.ok,
			});
		},
		[normalizedEndpoint],
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
					console.info(`${LOG_PREFIX} sse.snapshot_request`, {
						requestId,
					});
					const fields = snapshot();
					console.info(`${LOG_PREFIX} sse.snapshot_result`, {
						requestId,
						fieldCount: fields.length,
					});
					await handleBridgeResponse({
						type: "snapshot_response",
						requestId,
						fields,
					});
					return;
				}

				if (event.type === "execute_request") {
					console.info(`${LOG_PREFIX} sse.execute_request`, {
						requestId,
						actionCount: Array.isArray(event.actions)
							? event.actions.length
							: 0,
					});
					const actions = Array.isArray(event.actions)
						? (event.actions as BrowserToolAction[])
						: [];
					const fields = Array.isArray(event.fields)
						? (event.fields as SnapshotField[])
						: [];

					const report = execute(actions, fields);
					console.info(`${LOG_PREFIX} sse.execute_result`, {
						requestId,
						applied: report.applied,
						skipped: report.skipped,
					});
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
				setBridgeStatus("error");
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
		const currentSession = sessionRef.current;
		if (!currentSession) {
			return;
		}

		cleanupBridge();
		setBridgeStatus("connecting");

		const source = new EventSource(
			`${normalizedEndpoint}?type=bridge.events&sessionId=${encodeURIComponent(currentSession.sessionId)}&token=${encodeURIComponent(currentSession.token)}`,
		);
		console.info(`${LOG_PREFIX} sse.connect`, {
			sessionId: currentSession.sessionId,
		});
		eventSourceRef.current = source;

		source.onopen = () => {
			if (!mountedRef.current) {
				return;
			}
			setBridgeStatus("connected");
			console.info(`${LOG_PREFIX} sse.open`, {
				sessionId: currentSession.sessionId,
			});
		};

		source.onmessage = (message) => {
			console.info(`${LOG_PREFIX} sse.message.raw`, {
				sessionId: currentSession.sessionId,
				data: message.data,
			});
			try {
				const payload = JSON.parse(message.data) as unknown;
				console.info(`${LOG_PREFIX} sse.message.parsed`, {
					sessionId: currentSession.sessionId,
					type:
						typeof payload === "object" &&
						payload &&
						"type" in payload &&
						typeof (payload as { type?: unknown }).type === "string"
							? (payload as { type: string }).type
							: "unknown",
				});
				void handleBridgeEvent(payload);
			} catch (error) {
				console.error(`${LOG_PREFIX} sse.message.parse_error`, {
					sessionId: currentSession.sessionId,
					error: error instanceof Error ? error.message : String(error),
					data: message.data,
				});
			}
		};

		source.onerror = () => {
			if (!mountedRef.current) {
				return;
			}

			setBridgeStatus("connecting");
			console.warn(`${LOG_PREFIX} sse.error`, {
				sessionId: currentSession.sessionId,
			});
			if (!reconnectTimerRef.current) {
				reconnectTimerRef.current = setTimeout(() => {
					reconnectTimerRef.current = null;
					connect();
				}, 1500);
			}
		};
	}, [cleanupBridge, handleBridgeEvent, normalizedEndpoint]);

	useEffect(() => {
		mountedRef.current = true;

		return () => {
			mountedRef.current = false;
			cleanupBridge();
		};
	}, [cleanupBridge]);

	const handleStreamEvent = useCallback(
		(event: StreamEvent) => {
			if (typeof event.type !== "string") {
				return;
			}

			if (event.type === "bridge.session") {
				const sessionId = asString(event.sessionId);
				const token = asString(event.token);
				const expiresAt =
					asNumber(event.expiresAt) ?? Date.now() + 10 * 60 * 1000;
				if (!sessionId || !token) {
					return;
				}

				sessionRef.current = { sessionId, token, expiresAt };
				console.info(`${LOG_PREFIX} stream.bridge_session`, {
					sessionId,
				});
				connect();
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
			}
		},
		[connect],
	);

	const sendMessage = useCallback(
		async ({ message, document }: { message: string; document?: string }) => {
			const trimmedMessage = message.trim();
			if (!trimmedMessage || running) {
				return;
			}

			cleanupBridge();
			sessionRef.current = null;
			setBridgeStatus("idle");
			setError(null);
			setRunning(true);
			assistantBufferRef.current = "";
			messagesAssistantId.current = null;
			setMessages((current) => [
				...current,
				{ id: crypto.randomUUID(), role: "user", content: trimmedMessage },
			]);

			try {
				console.info(`${LOG_PREFIX} run.start`, {
					messageLength: trimmedMessage.length,
					hasDocument: Boolean(document?.trim()),
				});
				const response = await fetch(normalizedEndpoint, {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						type: "agent.run",
						message: trimmedMessage,
						document: document?.trim() ? document.trim() : undefined,
						session_id: geminiSessionId ?? undefined,
						sandbox_id: sandboxId ?? undefined,
					}),
				});

				if (!response.ok || !response.body) {
					throw new Error(`Failed to start stream (${response.status}).`);
				}
				console.info(`${LOG_PREFIX} run.stream.open`, {
					status: response.status,
				});

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

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
							// Ignore malformed chunks.
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
			} catch (sendError) {
				const messageText =
					sendError instanceof Error
						? sendError.message
						: "Failed to send message.";
				setError(messageText);
				setBridgeStatus("error");
				throw sendError;
			} finally {
				setRunning(false);
			}
		},
		[
			cleanupBridge,
			geminiSessionId,
			handleStreamEvent,
			normalizedEndpoint,
			running,
			sandboxId,
		],
	);

	const status: AgentStatus = running ? "running" : bridgeStatus;

	return {
		status,
		messages,
		tools,
		warnings,
		stderrLogs,
		sandboxId,
		geminiSessionId,
		error,
		sendMessage,
	};
}
