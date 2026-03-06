import type {
	LanguageModelV3,
	LanguageModelV3CallOptions,
	LanguageModelV3Prompt,
	LanguageModelV3StreamPart,
	LanguageModelV3StreamResult,
	LanguageModelV3ToolResultOutput,
} from "@ai-sdk/provider";
import { UnsupportedFunctionalityError } from "@ai-sdk/provider";
import {
	createMapperContext,
	extractJsonObjects,
	finishStream,
	mapNdjsonEvent,
} from "./ndjson-mapper";
import {
	createHttpRelaySubscription,
	postRelayResponse,
} from "./relay-http";
import {
	createGiselleSessionStateRawValue,
	getGiselleSessionIdFromProviderOptions,
	getGiselleSessionStateFromProviderOptions,
	mergeGiselleSessionStates,
} from "./session-state";
import {
	getLiveConnection,
	removeLiveConnection,
	saveLiveConnection,
} from "./session-manager";
import type {
	GiselleProviderDeps,
	GiselleProviderOptions,
	GiselleSessionState,
	LiveConnection,
} from "./types";

type ExtractedToolResult = {
	toolName: string;
	toolCallId: string;
	output: unknown;
};

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function toStringError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function buildCloudEndpoint(baseUrl: string): string {
	return trimTrailingSlash(baseUrl);
}

function createDefaultDeps(): GiselleProviderDeps {
	return {
		connectCloudApi: async (params) => {
			console.log(
				`[giselle-provider] connectCloudApi: endpoint=${params.endpoint}, snapshot_id=${params.snapshotId}, agent_type=${params.agentType}, session_id=${params.sessionId ?? "(new)"}, headers=${JSON.stringify(params.headers ?? {})}`,
			);
			const response = await fetch(params.endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(params.headers ?? {}),
				},
				body: JSON.stringify({
					type: "agent.run",
					message: params.message,
					document: params.document,
					session_id: params.sessionId,
					sandbox_id: params.sandboxId,
					agent_type: params.agentType,
					snapshot_id: params.snapshotId,
				}),
				signal: params.signal,
			});

			if (!response.ok || !response.body) {
				const body = await response.text().catch(() => "");
				throw new Error(
					`Cloud API request failed (${response.status}): ${body || response.statusText}`,
				);
			}

			return {
				reader: response.body.getReader(),
				response,
			};
		},
		createRelaySubscription: (params) => createHttpRelaySubscription(params),
		sendRelayResponse: (params) => postRelayResponse(params),
	};
}

function pickObjectField(value: unknown, field: string): unknown {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	return (value as Record<string, unknown>)[field];
}

export class GiselleAgentModel implements LanguageModelV3 {
	readonly modelId = "giselle-agent";
	readonly provider = "giselle";
	readonly specificationVersion = "v3";
	readonly supportedUrls = {} as Record<string, RegExp[]>;

	readonly options: GiselleProviderOptions;
	readonly deps: GiselleProviderDeps;

	constructor(options: GiselleProviderOptions) {
		this.options = options;
		const defaultDeps = createDefaultDeps();
		this.deps = {
			connectCloudApi:
				options.deps?.connectCloudApi ?? defaultDeps.connectCloudApi,
			createRelaySubscription:
				options.deps?.createRelaySubscription ??
				defaultDeps.createRelaySubscription,
			sendRelayResponse:
				options.deps?.sendRelayResponse ?? defaultDeps.sendRelayResponse,
		};
	}

	async doGenerate(): Promise<never> {
		throw new UnsupportedFunctionalityError({
			functionality: "doGenerate",
		});
	}

	async doStream(
		options: LanguageModelV3CallOptions,
	): Promise<LanguageModelV3StreamResult> {
		const requestedProviderSessionId = this.extractProviderSessionId(
			options.providerOptions,
		);
		const requestedSessionState = this.extractProviderSessionState(
			options.providerOptions,
		);
		const providerSessionId = requestedProviderSessionId ?? crypto.randomUUID();
		const stream = this.createStream(
			options,
			providerSessionId,
			requestedProviderSessionId !== undefined,
			requestedSessionState,
		);

		return {
			stream,
			request: undefined,
			response: {
				headers: {
					"x-giselle-session-id": providerSessionId,
				},
			},
		};
	}

	private createStream(
		options: LanguageModelV3CallOptions,
		providerSessionId: string,
		isResume: boolean,
		sessionState: GiselleSessionState | undefined,
	): ReadableStream<LanguageModelV3StreamPart> {
		return new ReadableStream<LanguageModelV3StreamPart>({
			start: (controller) => {
				void this.runStream({
					options,
					providerSessionId,
					isResume,
					sessionState,
					controller,
				});
			},
			cancel: () => {
				void removeLiveConnection(providerSessionId);
			},
		});
	}

	private async runStream(input: {
		options: LanguageModelV3CallOptions;
		providerSessionId: string;
		isResume: boolean;
		sessionState?: GiselleSessionState;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
	}): Promise<void> {
		try {
			input.controller.enqueue({
				type: "response-metadata",
				id: input.providerSessionId,
			});

			// `useChat` always sends a chat `id`. Treating every request that includes
			// an id as a resume causes false-positive resume attempts on first turns.
			// We only resume when the *last* message contains tool results — i.e. this
			// request is a direct continuation of a paused tool call. Checking all
			// messages would false-positive on follow-up user messages in conversations
			// that previously used tools (the old session is already deleted by then).
			const lastMessage = input.options.prompt[input.options.prompt.length - 1];
			const lastMessageHasToolResults =
				lastMessage?.role === "tool" &&
				lastMessage.content.some((part) => part.type === "tool-result");

			console.log(
				"[giselle-provider] runStream: providerSessionId=%s, isResume=%s, lastRole=%s, hasToolResults=%s, promptLength=%d",
				input.providerSessionId,
				input.isResume,
				lastMessage?.role,
				lastMessageHasToolResults,
				input.options.prompt.length,
			);

			if (input.isResume && lastMessageHasToolResults) {
				await this.resumeStream(input);
				return;
			}

			await this.startNewSessionStream({
				...input,
				isFollowUp: input.isResume,
			});
		} catch (error) {
			try {
				input.controller.enqueue({
					type: "error",
					error,
				});
			} catch {
				// ignore
			}
			try {
				input.controller.close();
			} catch {
				// ignore
			}
		}
	}

	private async startNewSessionStream(input: {
		options: LanguageModelV3CallOptions;
		providerSessionId: string;
		isFollowUp?: boolean;
		sessionState?: GiselleSessionState;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
	}): Promise<void> {
		let resumeData: { sessionId?: string; sandboxId?: string } | undefined;

		if (input.isFollowUp && input.sessionState) {
			console.log(
				"[giselle-provider] follow-up: existing session =",
				JSON.stringify(input.sessionState),
			);
			resumeData = {
				sessionId: input.sessionState.geminiSessionId,
				sandboxId: input.sessionState.sandboxId,
			};
		}

		console.log(
			"[giselle-provider] startNewSessionStream: isFollowUp=%s, resumeData=%s",
			!!input.isFollowUp,
			JSON.stringify(resumeData),
		);

		try {
			const connection = await this.connectCloudApi(input.options, resumeData);
			await this.consumeNdjsonStream({
				providerSessionId: input.providerSessionId,
				controller: input.controller,
				connection,
				sessionState: input.sessionState,
			});
		} catch (error) {
			await removeLiveConnection(input.providerSessionId).catch(() => undefined);
			throw error;
		}
	}

	private async resumeStream(input: {
		options: LanguageModelV3CallOptions;
		providerSessionId: string;
		sessionState?: GiselleSessionState;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
	}): Promise<void> {
		const sessionState = input.sessionState;

		if (!sessionState?.pendingRequestId) {
			// No pending tool-call to resume — the previous stream already
			// finished normally. Fall through to a follow-up session instead
			// of throwing, because `sendAutomaticallyWhen` may fire an extra
			// round-trip after the final tool result has already been delivered.
			await this.startNewSessionStream({
				...input,
				isFollowUp: true,
			});
			return;
		}

		if (
			!sessionState.relaySessionId ||
			!sessionState.relayToken ||
			!sessionState.relayUrl
		) {
			throw new Error(
				`Session ${input.providerSessionId} is missing relay credentials.`,
			);
		}

		const pendingResult = this.findPendingToolResult(
			input.options.prompt,
			sessionState.pendingRequestId,
		);
		if (!pendingResult) {
			throw new Error(
				`Missing tool result for pending request: ${sessionState.pendingRequestId}`,
			);
		}

		await this.deps.sendRelayResponse({
			relayUrl: sessionState.relayUrl,
			sessionId: sessionState.relaySessionId,
			token: sessionState.relayToken,
			response: this.toolResultToRelayResponse(
				pendingResult.toolName,
				pendingResult.toolCallId,
				pendingResult.output,
			),
		});

		const resumedSessionState = mergeGiselleSessionStates(sessionState, {
			pendingRequestId: null,
		});
		if (resumedSessionState) {
			input.controller.enqueue({
				type: "raw",
				rawValue: createGiselleSessionStateRawValue(resumedSessionState),
			});
		}

		const hotConnection = getLiveConnection(input.providerSessionId);
		if (hotConnection) {
			await this.consumeNdjsonStream({
				providerSessionId: input.providerSessionId,
				controller: input.controller,
				connection: hotConnection,
				sessionState: resumedSessionState,
			});
			return;
		}

		const coldConnection = await this.connectCloudApi(input.options, {
			sessionId: sessionState.geminiSessionId,
			sandboxId: sessionState.sandboxId,
		});
		await this.consumeNdjsonStream({
			providerSessionId: input.providerSessionId,
			controller: input.controller,
			connection: coldConnection,
			sessionState: resumedSessionState,
		});
	}

	private async consumeNdjsonStream(input: {
		providerSessionId: string;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
		connection: LiveConnection;
		sessionState?: GiselleSessionState;
	}): Promise<void> {
		const context = createMapperContext();
		context.textBlockOpen = input.connection.textBlockOpen;
		const sessionStateRef: { current?: GiselleSessionState } = {
			current: input.sessionState,
		};

		const decoder = new TextDecoder();
		let pausedForTool = false;
		let relayWatcherError: Error | null = null;
		let relayWatcherStarted = false;
		let relayWatcher: Promise<void> | null = null;

		const startRelayWatcher = () => {
			if (relayWatcherStarted || !input.connection.relaySubscription) {
				return;
			}

			relayWatcherStarted = true;
			relayWatcher = (async () => {
				while (!pausedForTool && input.connection.relaySubscription) {
					const relayEvent =
						await input.connection.relaySubscription.nextRequest();
					if (pausedForTool) {
						return;
					}

					const paused = await this.processRelayRequest({
						providerSessionId: input.providerSessionId,
						controller: input.controller,
						connection: input.connection,
						context,
						event: relayEvent,
						sessionStateRef,
					});
					if (!paused) {
						continue;
					}

					pausedForTool = true;
					await input.connection.relaySubscription
						.close()
						.catch(() => undefined);
					input.connection.relaySubscription = null;
					await input.connection.reader.cancel().catch(() => undefined);
					try {
						input.connection.reader.releaseLock();
					} catch {
						// ignore
					}
					return;
				}
			})().catch((error) => {
				relayWatcherError = new Error(
					`Relay subscription failed: ${toStringError(error)}`,
				);
			});
		};

		try {
			while (true) {
				startRelayWatcher();
				if (relayWatcherError) {
					throw relayWatcherError;
				}

				const { done, value } = await input.connection.reader.read();
				if (done) {
					break;
				}

				input.connection.buffer += decoder.decode(value, { stream: true });
				const parsed = extractJsonObjects(input.connection.buffer);
				input.connection.buffer = parsed.rest;

				for (const objectText of parsed.objects) {
					const paused = await this.processNdjsonObject({
						providerSessionId: input.providerSessionId,
						controller: input.controller,
						connection: input.connection,
						context,
						objectText,
						sessionStateRef,
					});
					startRelayWatcher();
					if (relayWatcherError) {
						throw relayWatcherError;
					}
					if (paused) {
						pausedForTool = true;
						return;
					}
				}
			}

			if (pausedForTool) {
				return;
			}

			const trailingBuffer = input.connection.buffer.trim();
			if (trailingBuffer.length > 0) {
				const paused = await this.processNdjsonObject({
					providerSessionId: input.providerSessionId,
					controller: input.controller,
					connection: input.connection,
					context,
					objectText: trailingBuffer,
					sessionStateRef,
				});
				if (paused) {
					pausedForTool = true;
					return;
				}
			}
			if (pausedForTool) {
				return;
			}

			const finishParts = finishStream(context);
			for (const part of finishParts) {
				input.controller.enqueue(part);
			}

			await input.connection.relaySubscription?.close().catch(() => undefined);
			input.connection.relaySubscription = null;

			const clearedSessionState = mergeGiselleSessionStates(
				sessionStateRef.current,
				{
					pendingRequestId: null,
				},
			);
			if (
				clearedSessionState &&
				sessionStateRef.current?.pendingRequestId !==
					clearedSessionState.pendingRequestId
			) {
				sessionStateRef.current = clearedSessionState;
				input.controller.enqueue({
					type: "raw",
					rawValue: createGiselleSessionStateRawValue(clearedSessionState),
				});
			}

			console.log(
				"[giselle-provider] stream finished, keeping session for follow-ups: %s",
				input.providerSessionId,
			);

			input.controller.close();
		} catch (error) {
			if (pausedForTool) {
				return;
			}

			input.connection.textBlockOpen = context.textBlockOpen;
			await input.connection.relaySubscription?.close().catch(() => undefined);
			input.connection.relaySubscription = null;
			await removeLiveConnection(input.providerSessionId).catch(
				() => undefined,
			);
			throw new Error(
				`Failed to process NDJSON stream: ${toStringError(error)}`,
			);
		} finally {
			if (relayWatcher) {
				await relayWatcher.catch(() => undefined);
			}

			if (!pausedForTool) {
				await removeLiveConnection(input.providerSessionId).catch(
					() => undefined,
				);
				try {
					input.connection.reader.releaseLock();
				} catch {
					// ignore
				}
			}
		}
	}

	private async processNdjsonObject(input: {
		providerSessionId: string;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
		connection: LiveConnection;
		context: ReturnType<typeof createMapperContext>;
		objectText: string;
		sessionStateRef: { current?: GiselleSessionState };
	}): Promise<boolean> {
		let event: Record<string, unknown>;
		try {
			event = JSON.parse(input.objectText) as Record<string, unknown>;
		} catch {
			return false;
		}

		console.log("[giselle-provider] NDJSON event:", JSON.stringify(event));

		const mapped = mapNdjsonEvent(event, input.context);
		if (mapped.sessionUpdate) {
			input.sessionStateRef.current = mergeGiselleSessionStates(
				input.sessionStateRef.current,
				mapped.sessionUpdate,
			);
			if (input.sessionStateRef.current) {
				input.controller.enqueue({
					type: "raw",
					rawValue: createGiselleSessionStateRawValue(
						input.sessionStateRef.current,
					),
				});
			}

			if (
				!input.connection.relaySubscription &&
				typeof mapped.sessionUpdate.relaySessionId === "string" &&
				typeof mapped.sessionUpdate.relayToken === "string" &&
				typeof mapped.sessionUpdate.relayUrl === "string"
			) {
				input.connection.relaySubscription = this.deps.createRelaySubscription({
					sessionId: mapped.sessionUpdate.relaySessionId,
					token: mapped.sessionUpdate.relayToken,
					relayUrl: mapped.sessionUpdate.relayUrl,
				});
			}
		}

		for (const part of mapped.parts) {
			input.controller.enqueue(part);
		}

		if (!mapped.relayRequest) {
			return false;
		}

		input.connection.textBlockOpen = input.context.textBlockOpen;
		saveLiveConnection(input.providerSessionId, input.connection);
		input.controller.close();
		return true;
	}

	private async processRelayRequest(input: {
		providerSessionId: string;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
		connection: LiveConnection;
		context: ReturnType<typeof createMapperContext>;
		event: Record<string, unknown>;
		sessionStateRef: { current?: GiselleSessionState };
	}): Promise<boolean> {
		const mapped = mapNdjsonEvent(input.event, input.context);
		if (mapped.sessionUpdate) {
			input.sessionStateRef.current = mergeGiselleSessionStates(
				input.sessionStateRef.current,
				mapped.sessionUpdate,
			);
			if (input.sessionStateRef.current) {
				input.controller.enqueue({
					type: "raw",
					rawValue: createGiselleSessionStateRawValue(
						input.sessionStateRef.current,
					),
				});
			}
		}

		for (const part of mapped.parts) {
			input.controller.enqueue(part);
		}

		if (!mapped.relayRequest) {
			return false;
		}

		input.connection.textBlockOpen = input.context.textBlockOpen;
		input.controller.close();
		return true;
	}

	private async connectCloudApi(
		options: LanguageModelV3CallOptions,
		resumeData?: {
			sessionId?: string;
			sandboxId?: string;
		},
	): Promise<LiveConnection> {
		const response = await this.deps.connectCloudApi({
			endpoint: buildCloudEndpoint(
				this.options.baseUrl ?? "https://studio.giselles.ai/agent-api/run",
			),
			message: this.extractUserMessage(options.prompt),
			sessionId: resumeData?.sessionId,
			sandboxId: resumeData?.sandboxId,
			agentType: this.options.agent.agentType ?? this.options.agent.type,
			snapshotId: this.options.agent.snapshotId,
			headers: this.mergeCloudHeaders(options.headers),
			signal: options.abortSignal,
		});

		return {
			reader: response.reader,
			buffer: "",
			relaySubscription: null,
			textBlockOpen: false,
		};
	}

	private mergeCloudHeaders(
		callHeaders: LanguageModelV3CallOptions["headers"],
	): Record<string, string> {
		const apiKey =
			this.options.apiKey ?? process.env.SANDBOX_AGENT_API_KEY?.trim();
		const headers: Record<string, string> = {};

		for (const [name, value] of Object.entries(this.options.headers ?? {})) {
			if (typeof value === "string") {
				headers[name] = value;
			}
		}

		for (const [name, value] of Object.entries(callHeaders ?? {})) {
			if (typeof value === "string") {
				headers[name] = value;
			}
		}

		if (apiKey) {
			headers.authorization = `Bearer ${apiKey}`;
		}

		return headers;
	}

	private extractProviderSessionId(
		providerOptions: LanguageModelV3CallOptions["providerOptions"],
	): string | undefined {
		return getGiselleSessionIdFromProviderOptions(providerOptions);
	}

	private extractProviderSessionState(
		providerOptions: LanguageModelV3CallOptions["providerOptions"],
	): GiselleSessionState | undefined {
		return getGiselleSessionStateFromProviderOptions(providerOptions);
	}

	private extractUserMessage(prompt: LanguageModelV3Prompt): string {
		for (let index = prompt.length - 1; index >= 0; index -= 1) {
			const message = prompt[index];
			if (message.role !== "user") {
				continue;
			}

			const text = message.content
				.filter(
					(
						part,
					): part is Extract<
						(typeof message.content)[number],
						{ type: "text" }
					> => part.type === "text",
				)
				.map((part) => part.text)
				.join("");
			if (text.trim().length > 0) {
				return text;
			}
		}

		throw new Error("Unable to extract user message from prompt.");
	}

	private extractToolResults(
		prompt: LanguageModelV3Prompt,
	): ExtractedToolResult[] {
		const results: ExtractedToolResult[] = [];

		for (const message of prompt) {
			if (message.role !== "tool") {
				continue;
			}

			for (const part of message.content) {
				if (part.type !== "tool-result") {
					continue;
				}

				results.push({
					toolName: part.toolName,
					toolCallId: part.toolCallId,
					output: this.toolResultOutputToUnknown(part.output),
				});
			}
		}

		return results;
	}

	private findPendingToolResult(
		prompt: LanguageModelV3Prompt,
		pendingRequestId: string,
	): ExtractedToolResult | undefined {
		return this.extractToolResults(prompt).find(
			(result) => result.toolCallId === pendingRequestId,
		);
	}

	private toolResultOutputToUnknown(
		output: LanguageModelV3ToolResultOutput,
	): unknown {
		switch (output.type) {
			case "text":
			case "error-text":
				return output.value;
			case "json":
			case "error-json":
				return output.value;
			case "execution-denied":
				return {
					type: "execution-denied",
					reason: output.reason,
				};
			case "content":
				return output.value;
		}
	}

	private toolResultToRelayResponse(
		toolName: string,
		toolCallId: string,
		result: unknown,
	): Record<string, unknown> {
		if (toolName === "getFormSnapshot") {
			return {
				type: "snapshot_response",
				requestId: toolCallId,
				fields: pickObjectField(result, "fields") ?? result,
			};
		}

		if (toolName === "executeFormActions") {
			return {
				type: "execute_response",
				requestId: toolCallId,
				report: pickObjectField(result, "report") ?? result,
			};
		}

		return {
			type: "error_response",
			requestId: toolCallId,
			message: `Unknown tool: ${toolName}`,
		};
	}
}
