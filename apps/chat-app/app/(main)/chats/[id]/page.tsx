import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { chat, message } from "@/db/schema/app-schema";
import { ChatDetail } from "./chat-detail";

export default async function ChatDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	const chatRecord = await db
		.select()
		.from(chat)
		.where(eq(chat.publicId, id))
		.then((rows) => rows[0]);

	if (!chatRecord) {
		notFound();
	}

	const savedMessages = await db
		.select()
		.from(message)
		.where(eq(message.chatId, chatRecord.id))
		.orderBy(asc(message.createdAt));

	const initialMessages = savedMessages.map((m) => m.message);

	return (
		<ChatDetail
			chatId={chatRecord.publicId}
			initialMessages={initialMessages}
		/>
	);
}
