import type { RelayRequest } from "@giselles-ai/browser-tool";
import type { BaseChatRequest } from "./chat-run";

export type CloudToolName = "getFormSnapshot" | "executeFormActions";

export type CloudToolResult = {
	toolCallId: string;
	toolName: CloudToolName;
	output: unknown;
};

export type CloudChatRequest = BaseChatRequest & {
	chat_id: string;
	tool_results?: CloudToolResult[];
};

export type CloudRelaySession = {
	sessionId: string;
	token: string;
	url: string;
	expiresAt: number;
};

export type PendingToolState = {
	requestId: string;
	requestType: RelayRequest["type"];
	toolName: CloudToolName;
};

export type CloudChatSessionState = {
	chatId: string;
	agentSessionId?: string;
	sandboxId?: string;
	relay?: CloudRelaySession;
	pendingTool?: PendingToolState | null;
	updatedAt: number;
};

export type CloudChatSessionPatch = {
	agentSessionId?: string;
	sandboxId?: string;
	relay?: CloudRelaySession;
	pendingTool?: PendingToolState | null;
};

export interface CloudChatStateStore {
	load(chatId: string): Promise<CloudChatSessionState | null>;
	save(state: CloudChatSessionState): Promise<void>;
	delete(chatId: string): Promise<void>;
}

export function toolNameFromRelayRequest(request: RelayRequest): CloudToolName {
	return request.type === "snapshot_request"
		? "getFormSnapshot"
		: "executeFormActions";
}

export function reduceCloudChatEvent(
	event: Record<string, unknown>,
): CloudChatSessionPatch | null {
	if (event.type === "init" && typeof event.session_id === "string") {
		return { agentSessionId: event.session_id };
	}

	if (event.type === "sandbox" && typeof event.sandbox_id === "string") {
		return { sandboxId: event.sandbox_id };
	}

	if (
		event.type === "relay.session" &&
		typeof event.sessionId === "string" &&
		typeof event.token === "string" &&
		typeof event.relayUrl === "string" &&
		typeof event.expiresAt === "number"
	) {
		return {
			relay: {
				sessionId: event.sessionId,
				token: event.token,
				url: event.relayUrl,
				expiresAt: event.expiresAt,
			},
		};
	}

	if (
		(event.type === "snapshot_request" || event.type === "execute_request") &&
		typeof event.requestId === "string"
	) {
		return {
			pendingTool: {
				requestId: event.requestId,
				requestType: event.type,
				toolName:
					event.type === "snapshot_request"
						? "getFormSnapshot"
						: "executeFormActions",
			},
		};
	}

	return null;
}

export function applyCloudChatPatch(input: {
	chatId: string;
	now: number;
	base?: CloudChatSessionState | null;
	patch?: CloudChatSessionPatch | null;
}): CloudChatSessionState {
	return {
		chatId: input.chatId,
		agentSessionId: input.patch?.agentSessionId ?? input.base?.agentSessionId,
		sandboxId: input.patch?.sandboxId ?? input.base?.sandboxId,
		relay: input.patch?.relay ?? input.base?.relay,
		pendingTool:
			input.patch?.pendingTool !== undefined
				? input.patch.pendingTool
				: input.base?.pendingTool,
		updatedAt: input.now,
	};
}
