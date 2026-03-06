import { describe, expect, it } from "vitest";
import {
	applyCloudChatPatch,
	reduceCloudChatEvent,
	toolNameFromRelayRequest,
} from "./cloud-chat-state";

describe("cloud-chat-state", () => {
	it("maps init events to agentSessionId patches", () => {
		const patch = reduceCloudChatEvent({
			type: "init",
			session_id: "session-1",
		});

		expect(patch).toEqual({ agentSessionId: "session-1" });
	});

	it("maps sandbox events to sandboxId patches", () => {
		const patch = reduceCloudChatEvent({
			type: "sandbox",
			sandbox_id: "sandbox-1",
		});

		expect(patch).toEqual({ sandboxId: "sandbox-1" });
	});

	it("maps relay.session events to relay patches", () => {
		const patch = reduceCloudChatEvent({
			type: "relay.session",
			sessionId: "relay-session-1",
			token: "token-1",
			relayUrl: "https://relay.example.com",
			expiresAt: 1730000000,
		});

		expect(patch).toEqual({
			relay: {
				sessionId: "relay-session-1",
				token: "token-1",
				url: "https://relay.example.com",
				expiresAt: 1730000000,
			},
		});
	});

	it("maps snapshot_request to getFormSnapshot pending state", () => {
		const patch = reduceCloudChatEvent({
			type: "snapshot_request",
			requestId: "tool-request-1",
		});

		expect(patch).toEqual({
			pendingTool: {
				requestId: "tool-request-1",
				requestType: "snapshot_request",
				toolName: "getFormSnapshot",
			},
		});
	});

	it("maps execute_request to executeFormActions pending state", () => {
		const patch = reduceCloudChatEvent({
			type: "execute_request",
			requestId: "tool-request-2",
		});

		expect(patch).toEqual({
			pendingTool: {
				requestId: "tool-request-2",
				requestType: "execute_request",
				toolName: "executeFormActions",
			},
		});
	});

	it("maps unknown events to no patch", () => {
		expect(reduceCloudChatEvent({ type: "unknown" })).toBeNull();
	});

	it("preserves chatId while applying patches", () => {
		const state = applyCloudChatPatch({
			chatId: "chat-123",
			now: 1730000100,
			base: {
				chatId: "chat-123",
				agentSessionId: "session-1",
				sandboxId: "sandbox-1",
				updatedAt: 1720000000,
			},
			patch: {
				agentSessionId: "session-2",
			},
		});

		expect(state).toEqual({
			chatId: "chat-123",
			agentSessionId: "session-2",
			sandboxId: "sandbox-1",
			relay: undefined,
			pendingTool: undefined,
			updatedAt: 1730000100,
		});
		expect((state as { agentSessionId?: string }).agentSessionId).toBe(
			"session-2",
		);
	});

	it("supports clearing pendingTool with null", () => {
		const state = applyCloudChatPatch({
			chatId: "chat-456",
			now: 1730000200,
			base: {
				chatId: "chat-456",
				pendingTool: {
					requestId: "tool-request-3",
					requestType: "snapshot_request",
					toolName: "getFormSnapshot",
				},
				updatedAt: 1720000000,
			},
			patch: {
				pendingTool: null,
			},
		});

		expect(state).toEqual({
			chatId: "chat-456",
			agentSessionId: undefined,
			sandboxId: undefined,
			relay: undefined,
			pendingTool: null,
			updatedAt: 1730000200,
		});
	});

	it("uses generic agentSessionId naming through helper exports", () => {
		const request = {
			type: "snapshot_request",
			requestId: "tool-request-4",
		} as const;
		const patch = reduceCloudChatEvent(request);

		expect(patch).toMatchObject({
			pendingTool: {
				toolName: "getFormSnapshot",
			},
		});
		expect(
			toolNameFromRelayRequest({
				type: "snapshot_request",
				requestId: "tool-request-4",
				instruction: "take snapshot",
			}),
		).toBe("getFormSnapshot");
		expect(
			(patch as { pendingTool: { requestType: string } }).pendingTool
				.requestType,
		).toBe("snapshot_request");
	});
});
