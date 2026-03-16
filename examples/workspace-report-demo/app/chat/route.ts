import { giselle } from "@giselles-ai/giselle-provider";
import {
	consumeStream,
	convertToModelMessages,
	streamText,
	type UIMessage,
	validateUIMessages,
} from "ai";
import { agent } from "../../lib/agent";

export async function POST(request: Request): Promise<Response> {
	const body = await request.json();
	const sessionId = body.id ?? crypto.randomUUID();

	const messages = await validateUIMessages<UIMessage>({
		messages: body.messages,
	});

	const result = streamText({
		model: giselle({ agent }),
		messages: await convertToModelMessages(messages),
		providerOptions: {
			giselle: {
				sessionId,
			},
		},
		abortSignal: request.signal,
	});

	return result.toUIMessageStreamResponse({
		headers: {
			"x-giselle-session-id": sessionId,
		},
		consumeSseStream: consumeStream,
	});
}
