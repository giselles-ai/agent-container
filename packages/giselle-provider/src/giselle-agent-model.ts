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
	createSession,
	deleteSession,
	getLiveConnection,
	loadSession,
	removeLiveConnection,
	saveLiveConnection,
	updateSession,
} from "./session-manager";
import type {
	GiselleProviderDeps,
	GiselleProviderOptions,
	LiveConnection,
	RelaySubscription,
} from "./types";

type ExtractedToolResult = {
	toolName: string;
	toolCallId: string;
	output: unknown;
};

function createDefaultRelaySubscription(): RelaySubscription {
	return {
		nextRequest: async () => {
			throw new Error(
				"createRelaySubscription is not implemented for giselle-provider phase 3.",
			);
		},
		close: async () => {},
	};
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function toStringError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function buildCloudEndpoint(cloudApiUrl: string): string {
	return `${trimTrailingSlash(cloudApiUrl)}/agent-api/run`;
}

function createDefaultDeps(): GiselleProviderDeps {
	return {
		connectCloudApi: async (params) => {
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
		createRelaySubscription: () => createDefaultRelaySubscription(),
		sendRelayResponse: async (params) => {
			const response = await fetch(params.relayUrl, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					type: "relay.respond",
					sessionId: params.sessionId,
					token: params.token,
					response: params.response,
				}),
			});

			if (!response.ok) {
				const body = await response.text().catch(() => "");
				throw new Error(
					`Relay response failed (${response.status}): ${body || response.statusText}`,
				);
			}
		},
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
		const providerSessionId = requestedProviderSessionId ?? crypto.randomUUID();
		const stream = this.createStream(
			options,
			providerSessionId,
			requestedProviderSessionId !== undefined,
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
	): ReadableStream<LanguageModelV3StreamPart> {
		return new ReadableStream<LanguageModelV3StreamPart>({
			start: (controller) => {
				void this.runStream({
					options,
					providerSessionId,
					isResume,
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
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
	}): Promise<void> {
		try {
			input.controller.enqueue({
				type: "response-metadata",
				id: input.providerSessionId,
			});

			if (input.isResume) {
				await this.resumeStream(input);
				return;
			}

			await this.startNewSessionStream(input);
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
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
	}): Promise<void> {
		await createSession({
			providerSessionId: input.providerSessionId,
			createdAt: Date.now(),
		});

		try {
			const connection = await this.connectCloudApi(input.options);
			await this.consumeNdjsonStream({
				providerSessionId: input.providerSessionId,
				controller: input.controller,
				connection,
			});
		} catch (error) {
			await deleteSession(input.providerSessionId).catch(() => undefined);
			throw error;
		}
	}

	private async resumeStream(input: {
		options: LanguageModelV3CallOptions;
		providerSessionId: string;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
	}): Promise<void> {
		const metadata = await loadSession(input.providerSessionId);
		if (!metadata) {
			throw new Error(
				`Provider session not found or expired: ${input.providerSessionId}`,
			);
		}

		if (!metadata.pendingRequestId) {
			throw new Error(
				`Session ${input.providerSessionId} has no pending request to resume.`,
			);
		}

		if (
			!metadata.relaySessionId ||
			!metadata.relayToken ||
			!metadata.relayUrl
		) {
			throw new Error(
				`Session ${input.providerSessionId} is missing relay credentials.`,
			);
		}

		const pendingResult = this.findPendingToolResult(
			input.options.prompt,
			metadata.pendingRequestId,
		);
		if (!pendingResult) {
			throw new Error(
				`Missing tool result for pending request: ${metadata.pendingRequestId}`,
			);
		}

		await this.deps.sendRelayResponse({
			relayUrl: metadata.relayUrl,
			sessionId: metadata.relaySessionId,
			token: metadata.relayToken,
			response: this.toolResultToRelayResponse(
				pendingResult.toolName,
				pendingResult.toolCallId,
				pendingResult.output,
			),
		});

		await updateSession(input.providerSessionId, {
			pendingRequestId: undefined,
		});

		const hotConnection = getLiveConnection(input.providerSessionId);
		if (hotConnection) {
			await this.consumeNdjsonStream({
				providerSessionId: input.providerSessionId,
				controller: input.controller,
				connection: hotConnection,
			});
			return;
		}

		const coldConnection = await this.connectCloudApi(input.options, {
			sessionId: metadata.geminiSessionId,
			sandboxId: metadata.sandboxId,
		});
		await this.consumeNdjsonStream({
			providerSessionId: input.providerSessionId,
			controller: input.controller,
			connection: coldConnection,
		});
	}

	private async consumeNdjsonStream(input: {
		providerSessionId: string;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
		connection: LiveConnection;
	}): Promise<void> {
		const context = createMapperContext();
		context.textBlockOpen = input.connection.textBlockOpen;

		const decoder = new TextDecoder();
		let pausedForTool = false;

		try {
			while (true) {
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
					});
					if (paused) {
						pausedForTool = true;
						return;
					}
				}
			}

			const trailingBuffer = input.connection.buffer.trim();
			if (trailingBuffer.length > 0) {
				const paused = await this.processNdjsonObject({
					providerSessionId: input.providerSessionId,
					controller: input.controller,
					connection: input.connection,
					context,
					objectText: trailingBuffer,
				});
				if (paused) {
					pausedForTool = true;
					return;
				}
			}

			const finishParts = finishStream(context);
			for (const part of finishParts) {
				input.controller.enqueue(part);
			}

			input.controller.close();
			await deleteSession(input.providerSessionId);
		} catch (error) {
			input.connection.textBlockOpen = context.textBlockOpen;
			await removeLiveConnection(input.providerSessionId).catch(
				() => undefined,
			);
			throw new Error(
				`Failed to process NDJSON stream: ${toStringError(error)}`,
			);
		} finally {
			if (!pausedForTool) {
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
	}): Promise<boolean> {
		let event: Record<string, unknown>;
		try {
			event = JSON.parse(input.objectText) as Record<string, unknown>;
		} catch {
			return false;
		}

		const mapped = mapNdjsonEvent(event, input.context);
		if (mapped.sessionUpdate) {
			await updateSession(input.providerSessionId, mapped.sessionUpdate);
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

	private async connectCloudApi(
		options: LanguageModelV3CallOptions,
		resumeData?: {
			sessionId?: string;
			sandboxId?: string;
		},
	): Promise<LiveConnection> {
		const response = await this.deps.connectCloudApi({
			endpoint: buildCloudEndpoint(this.options.cloudApiUrl),
			message: this.extractUserMessage(options.prompt),
			sessionId: resumeData?.sessionId,
			sandboxId: resumeData?.sandboxId,
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
		const headers: Record<string, string> = {
			...(this.options.headers ?? {}),
		};

		for (const [name, value] of Object.entries(callHeaders ?? {})) {
			if (typeof value === "string") {
				headers[name] = value;
			}
		}

		return headers;
	}

	private extractProviderSessionId(
		providerOptions: LanguageModelV3CallOptions["providerOptions"],
	): string | undefined {
		if (!providerOptions || typeof providerOptions !== "object") {
			return undefined;
		}

		const typedProviderOptions = providerOptions as {
			giselle?: {
				sessionId?: unknown;
			};
		};

		const sessionId = typedProviderOptions.giselle?.sessionId;
		return typeof sessionId === "string" ? sessionId : undefined;
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
