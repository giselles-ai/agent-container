import { createSlackAdapter } from "@chat-adapter/slack";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat } from "chat";
import { runAgent } from "@/lib/agent-runtime";
import {
	buildSlackPromptHistory,
	createSlackSessionId,
} from "@/lib/slack-history";

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

const botUserName = process.env.SLACK_BOT_USERNAME?.trim() || "giselle";

export const bot = new Chat({
	userName: botUserName,
	adapters: {
		slack: createSlackAdapter({
			botToken: requiredEnv("SLACK_BOT_TOKEN"),
			signingSecret: requiredEnv("SLACK_SIGNING_SECRET"),
		}),
	},
	state: createRedisState({
		url: requiredEnv("REDIS_URL"),
		keyPrefix: "chat-app-slack",
	}),
	logger: "info",
});

bot.onNewMention(async (thread) => {
	await thread.subscribe();

	try {
		const history = await buildSlackPromptHistory(thread);
		const result = runAgent({
			messages: history,
			sessionId: createSlackSessionId(thread.id),
		});
		await thread.post(result.fullStream);
	} catch (error) {
		console.error("Slack new mention failed", error);
		await thread.post("I hit an error while processing that message.");
	}
});

bot.onSubscribedMessage(async (thread) => {
	try {
		const history = await buildSlackPromptHistory(thread);
		const result = runAgent({
			messages: history,
			sessionId: createSlackSessionId(thread.id),
		});
		await thread.post(result.fullStream);
	} catch (error) {
		console.error("Slack subscribed message failed", error);
		await thread.post("I hit an error while processing that message.");
	}
});
