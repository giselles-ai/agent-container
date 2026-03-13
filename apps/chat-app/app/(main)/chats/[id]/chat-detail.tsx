"use client";

import type { UIMessage } from "ai";
import { ChatUI } from "../chat-ui";

export function ChatDetail({
	chatId,
	initialMessages,
}: {
	chatId: string;
	initialMessages: UIMessage[];
}) {
	return <ChatUI chatId={chatId} initialMessages={initialMessages} />;
}
