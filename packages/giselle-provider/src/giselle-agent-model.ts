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
import type { GiselleProviderDeps, GiselleProviderOptions } from "./types";

type ExtractedToolResult = {
	toolName: string;
	toolCallId: string;
	output: unknown;
};

type CloudConnection = {
	reader: ReadableStreamDefaultReader<Uint8Array>;
};

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function toStringError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function createDefaultDeps(): GiselleProviderDeps {
	return {
		connectCloudApi: async (params) => {
			console.log(
				`[giselle-provider] connectCloudApi: endpoint=${params.endpoint}, snapshot_id=${params.snapshotId}, agent_type=${params.agentType}, chat_id=${params.chatId}, headers=${JSON.stringify(params.headers ?? {})}`,
			);

			const body: Record<string, unknown> = {
				type: "agent.run",
				chat_id: params.chatId,
				message: params.message,
				agent_type: params.agentType,
				snapshot_id: params.snapshotId,
			};

			if (params.document !== undefined) {
				body.document = params.document;
			}
			if (params.toolResults !== undefined) {
				body.tool_results = params.toolResults;
			}

			const response = await fetch(params.endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(params.headers ?? {}),
				},
				body: JSON.stringify(body),
				signal: params.signal,
			});

			if (!response.ok || !response.body) {
				const bodyText = await response.text().catch(() => "");
				throw new Error(
					`Cloud API request failed (${response.status}): ${bodyText || response.statusText}`,
				);
			}

			return {
				reader: response.body.getReader(),
				response,
			};
		},
	};
}

function buildCloudEndpoint(baseUrl: string): string {
	return `${trimTrailingSlash(baseUrl)}/run`;
}

export class GiselleAgentModel implements LanguageModelV3 {
	readonly modelId = "giselle-agent";
	readonly provider = "giselle";
	readonly specificationVersion = "v3";
	readonly supportedUrls = {} as Record<string, RegExp[]>;

	readonly options: GiselleProviderOptions;
	readonly deps: GiselleProviderDeps;

	constructor(options: GiselleProviderOptions) {
		const defaultDeps = createDefaultDeps();
		this.options = options;
		this.deps = {
			connectCloudApi:
				options.deps?.connectCloudApi ?? defaultDeps.connectCloudApi,
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
		const chatId = this.extractChatId(options.providerOptions);
		const toolResults = this.extractToolResults(options.prompt);
		const stream = this.createStream(options, chatId, toolResults);

		return {
			stream,
			request: undefined,
			response: {
				headers: {
					"x-giselle-session-id": chatId,
				},
			},
		};
	}

	private createStream(
		options: LanguageModelV3CallOptions,
		chatId: string,
		toolResults: Array<{
			toolName: string;
			toolCallId: string;
			output: unknown;
		}>,
	): ReadableStream<LanguageModelV3StreamPart> {
		return new ReadableStream<LanguageModelV3StreamPart>({
			start: (controller) => {
				void this.runStream({
					options,
					chatId,
					toolResults,
					controller,
				});
			},
		});
	}

	private async runStream(input: {
		options: LanguageModelV3CallOptions;
		chatId: string;
		toolResults: Array<{
			toolName: string;
			toolCallId: string;
			output: unknown;
		}>;
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
	}): Promise<void> {
		try {
			input.controller.enqueue({
				type: "response-metadata",
				id: input.chatId,
			});

			const connection = await this.connectCloudApi(input.options, {
				chatId: input.chatId,
				toolResults: input.toolResults,
			});
			await this.consumeNdjsonStream({
				controller: input.controller,
				connection,
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

	private async consumeNdjsonStream(input: {
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
		connection: CloudConnection;
	}): Promise<void> {
		const context = createMapperContext();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await input.connection.reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const parsed = extractJsonObjects(buffer);
				buffer = parsed.rest;

				for (const objectText of parsed.objects) {
					await this.processNdjsonObject({
						controller: input.controller,
						context,
						objectText,
					});
				}
			}

			const trailingBuffer = buffer.trim();
			if (trailingBuffer.length > 0) {
				await this.processNdjsonObject({
					controller: input.controller,
					context,
					objectText: trailingBuffer,
				});
			}

			const finishParts = finishStream(context);
			for (const part of finishParts) {
				input.controller.enqueue(part);
			}

			input.controller.close();
		} catch (error) {
			throw new Error(
				`Failed to process NDJSON stream: ${toStringError(error)}`,
			);
		} finally {
			await input.connection.reader.cancel().catch(() => undefined);
			try {
				input.connection.reader.releaseLock();
			} catch {
				// ignore
			}
		}
	}

	private async processNdjsonObject(input: {
		controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
		context: ReturnType<typeof createMapperContext>;
		objectText: string;
	}): Promise<void> {
		let event: Record<string, unknown>;
		try {
			event = JSON.parse(input.objectText) as Record<string, unknown>;
		} catch {
			return;
		}

		console.log("[giselle-provider] NDJSON event:", JSON.stringify(event));

		const mapped = mapNdjsonEvent(event, input.context);
		for (const part of mapped.parts) {
			input.controller.enqueue(part);
		}

		if (mapped.snapshotId && this.options.snapshot?.onCreated) {
			try {
				await this.options.snapshot.onCreated(mapped.snapshotId);
			} catch (error) {
				console.error("[giselle-provider] snapshot.onCreated error:", error);
			}
		}
	}

	private async connectCloudApi(
		options: LanguageModelV3CallOptions,
		params: {
			chatId: string;
			toolResults?: ExtractedToolResult[];
		},
	): Promise<CloudConnection> {
		return this.deps.connectCloudApi({
			endpoint: buildCloudEndpoint(
				this.options.baseUrl ??
					process.env.GISELLE_AGENT_BASE_URL ??
					"https://studio.giselles.ai/agent-api",
			),
			chatId: params.chatId,
			message: this.extractUserMessage(options.prompt),
			toolResults: params.toolResults,
			agentType: this.options.agent.agentType ?? this.options.agent.type,
			snapshotId: this.options.agent.snapshotId,
			headers: this.mergeCloudHeaders(options.headers),
			signal: options.abortSignal,
		});
	}

	private mergeCloudHeaders(
		callHeaders: LanguageModelV3CallOptions["headers"],
	): Record<string, string> {
		const apiKey =
			this.options.apiKey ?? process.env.GISELLE_AGENT_API_KEY?.trim();
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

	private extractChatId(
		providerOptions: LanguageModelV3CallOptions["providerOptions"],
	): string {
		if (!providerOptions || typeof providerOptions !== "object") {
			return crypto.randomUUID();
		}

		const typedProviderOptions = providerOptions as {
			giselle?: { sessionId?: unknown };
		};

		return (
			asNonEmptyString(typedProviderOptions.giselle?.sessionId) ??
			crypto.randomUUID()
		);
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
}
