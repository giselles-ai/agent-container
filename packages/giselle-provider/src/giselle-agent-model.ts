import type {
	LanguageModelV3,
	LanguageModelV3CallOptions,
	LanguageModelV3StreamPart,
	LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { UnsupportedFunctionalityError } from "@ai-sdk/provider";
import type { GiselleProviderOptions } from "./types";

export class GiselleAgentModel implements LanguageModelV3 {
	readonly modelId = "giselle-agent";
	readonly provider = "giselle";
	readonly specificationVersion = "v3";
	readonly supportedUrls = {} as Record<string, RegExp[]>;

	readonly options: GiselleProviderOptions;

	constructor(options: GiselleProviderOptions) {
		this.options = options;
	}

	async doGenerate(): Promise<never> {
		throw new UnsupportedFunctionalityError({
			functionality: "doGenerate",
		});
	}

	async doStream(
		options: LanguageModelV3CallOptions,
	): Promise<LanguageModelV3StreamResult> {
		const providerSessionId = this.extractProviderSessionId(
			options.providerOptions,
		);

		const stream = this.createStream(options, providerSessionId);

		return {
			stream,
			request: undefined,
			response: undefined,
		};
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

	private createStream(
		_options: LanguageModelV3CallOptions,
		_providerSessionId: string | undefined,
	): ReadableStream<LanguageModelV3StreamPart> {
		return new ReadableStream<LanguageModelV3StreamPart>({
			start(controller) {
				controller.enqueue({
					type: "finish",
					finishReason: {
						unified: "stop",
						raw: undefined,
					},
					usage: {
						inputTokens: {
							total: 0,
							noCache: 0,
							cacheRead: 0,
							cacheWrite: 0,
						},
						outputTokens: {
							total: 0,
							text: 0,
							reasoning: 0,
						},
					},
				});
				controller.close();
			},
		});
	}
}
