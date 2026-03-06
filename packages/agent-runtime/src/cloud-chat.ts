import {
	type RelayRequest,
	type RelayResponse,
	relayRequestSchema,
} from "@giselles-ai/browser-tool";
import {
	createRelayRequestSubscription,
	type RelayRequestSubscription,
	sendRelayResponse,
} from "@giselles-ai/browser-tool/relay";
import type { BaseChatRequest, ChatAgent, RunChatInput } from "./chat-run";
import { runChat } from "./chat-run";
import {
	getLiveCloudConnection,
	removeLiveCloudConnection,
	saveLiveCloudConnection,
} from "./cloud-chat-live";
import {
	relayRequestToNdjsonEvent,
	relayRequestToPendingTool,
	toolResultToRelayResponse,
} from "./cloud-chat-relay";
import {
	applyCloudChatPatch,
	type CloudChatRequest,
	type CloudChatSessionState,
	type CloudChatStateStore,
	type CloudToolResult,
	reduceCloudChatEvent,
} from "./cloud-chat-state";

type CloudChatManagedInput = {
	chatId: string;
	store: CloudChatStateStore;
	now: number;
	baseState: CloudChatSessionState | null | undefined;
	reader: ReadableStreamDefaultReader<Uint8Array> | null;
	relaySubscription: RelayRequestSubscription | null;
	status: number;
	statusText: string;
	headers: Headers;
	initialBuffer: string;
	initialTextBlockOpen: boolean;
};

type ManagedRunResult = {
	response: Response;
};

const pendingReadAheadByChatId = new Map<
	string,
	Promise<ReadableStreamReadResult<Uint8Array>>
>();

export type RelaySessionFactoryResult = {
	sessionId: string;
	token: string;
	expiresAt: number;
};

export type RunChatImpl<TRequest extends BaseChatRequest> = (
	input: RunChatInput<TRequest>,
) => Promise<Response>;

export type CloudChatDeps<TRequest extends BaseChatRequest> = {
	store: CloudChatStateStore;
	relayUrl: string;
	createRelaySession: () => Promise<RelaySessionFactoryResult>;
	runChatImpl?: RunChatImpl<TRequest>;
	now?: () => number;
	createRelayRequestSubscription?: (input: {
		sessionId: string;
		token: string;
	}) => Promise<RelayRequestSubscription>;
	sendRelayResponse?: (input: {
		sessionId: string;
		token: string;
		response: RelayResponse;
	}) => Promise<void>;
};

export async function runCloudChat<
	TRequest extends CloudChatRequest & {
		relay_session_id?: string;
		relay_token?: string;
	},
>(input: {
	chatId: string;
	request: Omit<
		TRequest,
		"session_id" | "sandbox_id" | "relay_session_id" | "relay_token"
	>;
	agent: ChatAgent<TRequest>;
	signal: AbortSignal;
	deps: CloudChatDeps<TRequest>;
}): Promise<Response> {
	const now = input.deps.now?.() ?? Date.now();
	const createRelaySub =
		input.deps.createRelayRequestSubscription ?? createRelayRequestSubscription;
	const sendResponse = input.deps.sendRelayResponse ?? sendRelayResponse;
	const existing = await input.deps.store.load(input.chatId);

	if (existing?.pendingTool) {
		return resumeCloudChat({
			chatId: input.chatId,
			agent: input.agent,
			signal: input.signal,
			request: input.request,
			store: input.deps.store,
			relayUrl: input.deps.relayUrl,
			existing,
			deps: input.deps,
			now,
			createRelaySub,
			sendResponse,
		});
	}

	const relaySession = await input.deps.createRelaySession();
	const runtimeInput = {
		...input.request,
		...(existing?.agentSessionId
			? { session_id: existing.agentSessionId }
			: {}),
		...(existing?.sandboxId ? { sandbox_id: existing.sandboxId } : {}),
		relay_session_id: relaySession.sessionId,
		relay_token: relaySession.token,
	} as TRequest;

	const response = await (input.deps.runChatImpl ?? runChat)({
		agent: input.agent,
		signal: input.signal,
		input: runtimeInput,
	});
	const relaySubscription = await createRelaySub({
		sessionId: relaySession.sessionId,
		token: relaySession.token,
	});
	const managed = createManagedCloudResponseFromReader({
		chatId: input.chatId,
		store: input.deps.store,
		now,
		baseState: existing,
		reader: response.body?.getReader() ?? null,
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
		relaySubscription,
		relaySession,
		relayUrl: input.deps.relayUrl,
		includeRelaySessionPrelude: true,
		initialBuffer: "",
		initialTextBlockOpen: false,
	});

	return managed.response;
}

async function resumeCloudChat<TRequest extends CloudChatRequest>(input: {
	chatId: string;
	agent: ChatAgent<TRequest>;
	signal: AbortSignal;
	request: Omit<
		TRequest,
		"session_id" | "sandbox_id" | "relay_session_id" | "relay_token"
	>;
	store: CloudChatStateStore;
	relayUrl: string;
	existing: CloudChatSessionState;
	deps: CloudChatDeps<TRequest>;
	now: number;
	createRelaySub: (input: {
		sessionId: string;
		token: string;
	}) => Promise<RelayRequestSubscription>;
	sendResponse: (input: {
		sessionId: string;
		token: string;
		response: RelayResponse;
	}) => Promise<void>;
}): Promise<Response> {
	const pending = input.existing.pendingTool;
	if (!pending) {
		throw new Error(`Chat ${input.chatId} does not have a pending tool.`);
	}
	const toolResult = findMatchingToolResult(
		input.request.tool_results ?? [],
		pending.requestId,
	);
	if (!toolResult) {
		throw new Error(`Missing tool result for ${pending.requestId}`);
	}
	if (!input.existing.relay) {
		throw new Error(`Chat ${input.chatId} is missing relay credentials.`);
	}

	await input.sendResponse({
		sessionId: input.existing.relay.sessionId,
		token: input.existing.relay.token,
		response: toolResultToRelayResponse({
			pending,
			result: toolResult,
		}),
	});

	const resumedState = applyCloudChatPatch({
		chatId: input.chatId,
		now: input.now,
		base: input.existing,
		patch: { pendingTool: null },
	});
	await input.store.save(resumedState);

	const hotConnection = getLiveCloudConnection(input.chatId);
	if (hotConnection) {
		return continueManagedCloudResponseFromLiveConnection({
			chatId: input.chatId,
			baseState: resumedState,
			store: input.store,
			now: input.now,
			connection: hotConnection,
		});
	}

	const relaySession = await input.deps.createRelaySession();
	const runtimeInput = {
		...input.request,
		...(input.existing.agentSessionId
			? { session_id: input.existing.agentSessionId }
			: {}),
		...(input.existing.sandboxId
			? { sandbox_id: input.existing.sandboxId }
			: {}),
		relay_session_id: relaySession.sessionId,
		relay_token: relaySession.token,
	} as unknown as TRequest;

	const response = await (input.deps.runChatImpl ?? runChat)({
		agent: input.agent,
		signal: input.signal,
		input: runtimeInput,
	});
	const relaySubscription = await input.createRelaySub({
		sessionId: relaySession.sessionId,
		token: relaySession.token,
	});

	const managed = createManagedCloudResponseFromReader({
		chatId: input.chatId,
		store: input.store,
		now: input.now,
		baseState: resumedState,
		reader: response.body?.getReader() ?? null,
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
		relaySubscription,
		relaySession,
		relayUrl: input.relayUrl,
		includeRelaySessionPrelude: true,
		initialBuffer: "",
		initialTextBlockOpen: false,
	});

	return managed.response;
}

function findMatchingToolResult(
	toolResults: CloudToolResult[],
	requestId: string,
): CloudToolResult | undefined {
	return toolResults.find((result) => result.toolCallId === requestId);
}

function createManagedCloudResponseFromReader(
	input: CloudChatManagedInput & {
		relayUrl?: string;
		relaySession?: RelaySessionFactoryResult;
		includeRelaySessionPrelude: boolean;
	},
): ManagedRunResult {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	let state = input.baseState ?? null;
	let buffer = input.initialBuffer;
	const textBlockOpen = input.initialTextBlockOpen;
	let paused = false;
	const nextRead = pendingReadAheadByChatId.get(input.chatId) ?? null;
	if (nextRead !== null) {
		pendingReadAheadByChatId.delete(input.chatId);
	}
	let activeReader = nextRead;

	const managedStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const close = () => {
				try {
					controller.close();
				} catch {
					// ignore
				}
			};

			const persistPatch = async (
				patch: ReturnType<typeof reduceCloudChatEvent> | null,
			) => {
				if (!patch) {
					return;
				}

				state = applyCloudChatPatch({
					chatId: input.chatId,
					now: input.now,
					base: state,
					patch,
				});
				await input.store.save(state);
			};

			const savePauseState = async () => {
				if (!input.reader) {
					return;
				}

				saveLiveCloudConnection(input.chatId, {
					reader: input.reader,
					buffer,
					textBlockOpen,
					relaySubscription: input.relaySubscription,
					status: input.status,
					statusText: input.statusText,
					headers: new Headers(input.headers),
				});
			};

			const pauseForRelay = async (
				request: RelayRequest,
				savePendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null,
			) => {
				paused = true;
				const pending = relayRequestToPendingTool(request);
				await persistPatch({ pendingTool: pending });
				controller.enqueue(
					encoder.encode(
						`${JSON.stringify(relayRequestToNdjsonEvent(request))}\n`,
					),
				);
				if (savePendingRead) {
					pendingReadAheadByChatId.set(input.chatId, savePendingRead);
				}
				await savePauseState();
				close();
			};

			const flushLine = async (
				rawLine: string,
				savePendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null,
			): Promise<boolean> => {
				if (rawLine.length === 0) {
					controller.enqueue(encoder.encode("\n"));
					return false;
				}

				const normalizedLine = rawLine.endsWith("\r")
					? rawLine.slice(0, -1)
					: rawLine;
				controller.enqueue(encoder.encode(`${rawLine}\n`));

				let event: Record<string, unknown>;
				try {
					event = JSON.parse(normalizedLine) as Record<string, unknown>;
				} catch {
					return false;
				}

				const parsed = relayRequestSchema.safeParse(event);
				if (parsed.success) {
					await pauseForRelay(parsed.data, savePendingRead);
					return true;
				}

				const patch = reduceCloudChatEvent(event);
				if (patch) {
					await persistPatch(patch);
				}

				return false;
			};

			if (input.includeRelaySessionPrelude) {
				if (!input.relaySession || !input.relayUrl) {
					throw new Error(
						"Missing relay session context when prelude emission is requested.",
					);
				}

				const preludeEvent = {
					type: "relay.session",
					relayUrl: input.relayUrl,
					sessionId: input.relaySession.sessionId,
					token: input.relaySession.token,
					expiresAt: input.relaySession.expiresAt,
				};
				const prelude = `${JSON.stringify(preludeEvent)}\n`;
				controller.enqueue(encoder.encode(prelude));
				await persistPatch(reduceCloudChatEvent(preludeEvent));
			}

			if (!input.reader) {
				close();
				return;
			}

			try {
				while (!paused) {
					if (!activeReader) {
						activeReader = input.reader.read();
					}

						const nextEventPromise =
							input.relaySubscription !== null
								? Promise.race([
										activeReader.then(
											(
												result,
											): {
												kind: "reader";
												result: ReadableStreamReadResult<Uint8Array>;
											} => ({
												kind: "reader",
												result,
											}),
										),
										input.relaySubscription.nextRequest().then(
											(
												request,
											): {
												kind: "relay";
												request: RelayRequest;
											} => ({
												kind: "relay",
												request,
											}),
										),
									])
								: activeReader.then(
										(
											result,
										): {
											kind: "reader";
											result: ReadableStreamReadResult<Uint8Array>;
										} => ({
											kind: "reader",
											result,
										}),
									);

					const outcome = await nextEventPromise;

					if (outcome.kind === "relay") {
						await pauseForRelay(outcome.request, activeReader);
						return;
					}

					const { done, value } = outcome.result;
					activeReader = null;

					if (done) {
						break;
					}

					if (!value) {
						continue;
					}

					buffer += decoder.decode(value, { stream: true });
					let newlineIndex = buffer.indexOf("\n");
					while (newlineIndex >= 0) {
						const rawLine = buffer.slice(0, newlineIndex);
						buffer = buffer.slice(newlineIndex + 1);
						const shouldPause = await flushLine(rawLine, null);
						if (shouldPause) {
							return;
						}
						newlineIndex = buffer.indexOf("\n");
					}
				}

				if (paused) {
					return;
				}

				buffer += decoder.decode();
				if (buffer.length > 0) {
					await flushLine(buffer, null);
				}
			} finally {
				if (!paused) {
					await removeLiveCloudConnection(input.chatId);
				}

				pendingReadAheadByChatId.delete(input.chatId);
			}

			close();
		},
	});

	return {
		response: new Response(managedStream, {
			status: input.status,
			statusText: input.statusText,
			headers: input.headers,
		}),
	};
}

function continueManagedCloudResponseFromLiveConnection(input: {
	chatId: string;
	baseState: CloudChatSessionState;
	store: CloudChatStateStore;
	now: number;
	connection: {
		reader: ReadableStreamDefaultReader<Uint8Array>;
		buffer: string;
		textBlockOpen: boolean;
		relaySubscription: RelayRequestSubscription | null;
		status: number;
		statusText: string;
		headers: Headers;
	};
}): Response {
	const managed = createManagedCloudResponseFromReader({
		chatId: input.chatId,
		store: input.store,
		now: input.now,
		baseState: input.baseState,
		reader: input.connection.reader,
		relaySubscription: input.connection.relaySubscription,
		status: input.connection.status,
		statusText: input.connection.statusText,
		headers: new Headers(input.connection.headers),
		includeRelaySessionPrelude: false,
		relaySession: undefined,
		relayUrl: undefined,
		initialBuffer: input.connection.buffer,
		initialTextBlockOpen: input.connection.textBlockOpen,
	});

	return managed.response;
}
