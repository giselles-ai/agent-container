import type { ChatAgent } from "../chat-handler";
import { createGeminiAgent, type GeminiAgentRequest } from "./gemini-agent";

export type BrowserToolGeminiBridgeAgentOptions = {
	snapshotId?: string;
	browserToolRelayUrl?: string;
};

export function createBrowserToolGeminiBridgeAgent(
	options: BrowserToolGeminiBridgeAgentOptions = {},
): ChatAgent<GeminiAgentRequest> {
	return createGeminiAgent({
		snapshotId: options.snapshotId,
		browserTool: {
			relayUrl: options.browserToolRelayUrl,
		},
	});
}
