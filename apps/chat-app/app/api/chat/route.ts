import { type BrowserTools, browserTools } from "@giselles-ai/browser-tool";
import { giselle } from "@giselles-ai/giselle-provider";
import { pipeJsonRender } from "@json-render/core";
import {
	consumeStream,
	convertToModelMessages,
	createIdGenerator,
	createUIMessageStream,
	createUIMessageStreamResponse,
	type InferUITools,
	streamText,
	type UIMessage,
	validateUIMessages,
} from "ai";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { chat, message } from "@/db/schema/app-schema";
import { agent } from "@/lib/agent";
import { getAuth } from "@/lib/auth";

export async function POST(request: Request): Promise<Response> {
	const auth = getAuth();
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = await request.json();
	const sessionId = body.id ?? crypto.randomUUID();

	let chatRecord = await db
		.select()
		.from(chat)
		.where(eq(chat.publicId, sessionId))
		.then((rows) => rows[0]);

	if (!chatRecord) {
		const inserted = await db
			.insert(chat)
			.values({
				publicId: sessionId,
				userId: Number.parseInt(session.user.id, 10),
			})
			.returning();
		chatRecord = inserted[0];
	}

	const messages = await validateUIMessages<
		UIMessage<never, never, InferUITools<BrowserTools>>
	>({
		messages: body.messages,
		tools: browserTools,
	});

	const lastUserMessage = messages.filter((m) => m.role === "user").at(-1);
	if (lastUserMessage) {
		await db.insert(message).values({
			publicId: lastUserMessage.id,
			chatId: chatRecord.id,
			message: lastUserMessage,
		});
	}

	const result = streamText({
		model: giselle({ agent }),
		messages: await convertToModelMessages(messages),
		tools: browserTools,
		providerOptions: {
			giselle: {
				sessionId,
			},
		},
		abortSignal: request.signal,
	});

	const messageStreamOptions = {
		generateMessageId: createIdGenerator({
			prefix: "msg",
			size: 16,
		}),
		onFinish: async ({
			messages: generatedMessages,
		}: {
			messages: UIMessage[];
		}) => {
			for (const generatedMessage of generatedMessages) {
				await db
					.insert(message)
					.values({
						publicId: generatedMessage.id,
						chatId: chatRecord.id,
						message: generatedMessage,
					})
					.onConflictDoNothing();
			}
		},
	};

	const stream = createUIMessageStream({
		...messageStreamOptions,
		execute: async ({ writer }) => {
			writer.merge(pipeJsonRender(result.toUIMessageStream()));
		},
	});

	return createUIMessageStreamResponse({
		stream,
		consumeSseStream: consumeStream,
		headers: {
			"x-giselle-session-id": sessionId,
			"x-giselle-chat-id": chatRecord.publicId,
		},
	});
}
