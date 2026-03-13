import { giselle } from "@giselles-ai/giselle-provider";
import { type ModelMessage, streamText } from "ai";
import { agent } from "@/lib/agent";

export interface RunAgentOptions {
	sessionId: string;
	messages: ModelMessage[];
	abortSignal?: AbortSignal;
}

export function runAgent({
	sessionId,
	messages,
	abortSignal,
}: RunAgentOptions) {
	return streamText({
		model: giselle({ agent }),
		messages,
		providerOptions: {
			giselle: {
				sessionId,
			},
		},
		abortSignal,
	});
}
