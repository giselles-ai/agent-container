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

export type AgentParam<TRequest extends BaseChatRequest> =
	| ChatAgent<TRequest>
	| CreateAgentOptions;

function isCreateAgentOptions(
	param: AgentParam<BaseChatRequest>,
): param is CreateAgentOptions {
	return (
		"type" in param &&
		(param.type === "gemini" || param.type === "codex") &&
		!("requestSchema" in param)
	);
}

export function resolveAgent<TRequest extends BaseChatRequest>(
	param: AgentParam<TRequest>,
): ChatAgent<TRequest> {
	if (isCreateAgentOptions(param)) {
		return createAgent(param) as ChatAgent<TRequest>;
	}
	return param;
}

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
