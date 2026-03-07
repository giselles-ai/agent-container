import type { BaseChatRequest, ChatAgent } from "../chat-run";
import { type CodexAgentOptions, createCodexAgent } from "./codex-agent";
import { createGeminiAgent, type GeminiAgentOptions } from "./gemini-agent";

export type AgentType = "gemini" | "codex";

export type AgentRequest = BaseChatRequest & {
	relay_session_id?: string;
	relay_token?: string;
};

export type CreateAgentOptions = (GeminiAgentOptions & CodexAgentOptions) & {
	type: AgentType;
};

export function createAgent(
	options: CreateAgentOptions,
): ChatAgent<AgentRequest> {
	const { type, ...agentOptions } = options;

	switch (type) {
		case "gemini":
			return createGeminiAgent(agentOptions);
		case "codex":
			return createCodexAgent(agentOptions);
	}
}
