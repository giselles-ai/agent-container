import {
	type BaseChatRequest,
	type ChatAgent,
	type RunChatInput,
	runChat,
} from "./chat-run";
import {
	applyCloudChatPatch,
	type CloudChatRequest,
	type CloudChatSessionState,
	type CloudChatStateStore,
	reduceCloudChatEvent,
} from "./cloud-chat-state";

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
};

export async function runCloudChat<
	TRequest extends BaseChatRequest & {
		relay_session_id?: string;
		relay_token?: string;
	},
>(input: {
	chatId: string;
	request: Omit<
		TRequest,
		"session_id" | "sandbox_id" | "relay_session_id" | "relay_token"
	> &
		Pick<CloudChatRequest, "tool_results">;
	agent: ChatAgent<TRequest>;
	signal: AbortSignal;
	deps: CloudChatDeps<TRequest>;
}): Promise<Response> {
	const now = input.deps.now?.() ?? Date.now();
	const existing = await input.deps.store.load(input.chatId);

	if (existing?.pendingTool) {
		throw new Error(
			`Chat ${input.chatId} is paused on ${existing.pendingTool.requestId}; tool resume lands in Phase 2.`,
		);
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

	return createManagedCloudResponse({
		chatId: input.chatId,
		relayUrl: input.deps.relayUrl,
		relaySession,
		baseState: existing,
		now,
		response,
		store: input.deps.store,
	});
}

function createManagedCloudResponse(input: {
	chatId: string;
	relayUrl: string;
	relaySession: RelaySessionFactoryResult;
	baseState: CloudChatSessionState | null | undefined;
	now: number;
	response: Response;
	store: CloudChatStateStore;
}): Response {
	const encoder = new TextEncoder();
	const prepend = `${JSON.stringify({
		type: "relay.session",
		relayUrl: input.relayUrl,
		sessionId: input.relaySession.sessionId,
		token: input.relaySession.token,
		expiresAt: input.relaySession.expiresAt,
	})}\n`;

	const managedStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const close = () => {
				try {
					controller.close();
				} catch {
					// ignore
				}
			};

			controller.enqueue(encoder.encode(prepend));

			if (!input.response.body) {
				close();
				return;
			}

			let state = input.baseState ?? null;
			const reader = input.response.body.getReader();
			const decoder = new TextDecoder();
			let buffered = "";

			const flushLine = async (rawLine: string) => {
				if (rawLine.length > 0) {
					const normalizedLine = rawLine.endsWith("\r")
						? rawLine.slice(0, -1)
						: rawLine;
					controller.enqueue(encoder.encode(`${rawLine}\n`));

					try {
						const event = JSON.parse(normalizedLine) as Record<string, unknown>;
						const patch = reduceCloudChatEvent(event);
						if (patch) {
							state = applyCloudChatPatch({
								chatId: input.chatId,
								now: input.now,
								base: state,
								patch,
							});
							await input.store.save(state);
						}
					} catch {
						// not a JSON event or not a recognized cloud event
						// keep passthrough bytes as-is
					}
				} else {
					controller.enqueue(encoder.encode("\n"));
				}
			};

			while (true) {
				const chunk = await reader.read();
				if (chunk.done) {
					break;
				}
				if (chunk.value) {
					buffered += decoder.decode(chunk.value, { stream: true });
					let newlineIndex = buffered.indexOf("\n");
					while (newlineIndex >= 0) {
						const rawLine = buffered.slice(0, newlineIndex);
						await flushLine(rawLine);
						buffered = buffered.slice(newlineIndex + 1);
						newlineIndex = buffered.indexOf("\n");
					}
				}
			}

			buffered += decoder.decode();

			if (buffered.length > 0) {
				await flushLine(buffered);
			}

			close();
		},
	});

	return new Response(managedStream, {
		status: input.response.status,
		statusText: input.response.statusText,
		headers: input.response.headers,
	});
}
