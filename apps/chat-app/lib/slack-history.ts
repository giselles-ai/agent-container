import type { Thread } from "chat";
import { type AiMessage, toAiMessages } from "chat";

const parsedSlackHistoryLimit = Number.parseInt(
	process.env.SLACK_HISTORY_LIMIT ?? "20",
	10,
);
const DEFAULT_HISTORY_LIMIT = Number.isFinite(parsedSlackHistoryLimit)
	? parsedSlackHistoryLimit
	: 20;

export async function buildSlackPromptHistory(
	thread: Thread,
): Promise<AiMessage[]> {
	const result = await thread.adapter.fetchMessages(thread.id, {
		limit: DEFAULT_HISTORY_LIMIT,
	});

	return toAiMessages(result.messages);
}

export function createSlackSessionId(threadId: string): string {
	return `slack:${threadId}`;
}
