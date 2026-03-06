import { describe, expect, it } from "vitest";
import {
	buildGiselleChatRequestBody,
	createGiselleMessageMetadata,
	getLatestGiselleSessionStateFromMessages,
} from "../session-state";

describe("session-state helpers", () => {
	it("finds the latest assistant session state even when a tool message is last", () => {
		const sessionState = getLatestGiselleSessionStateFromMessages([
			{ role: "user" },
			{
				role: "assistant",
				metadata: createGiselleMessageMetadata({
					geminiSessionId: "gem-1",
					sandboxId: "sandbox-1",
					pendingRequestId: "req-1",
				}),
			},
			{ role: "tool" },
		]);

		expect(sessionState).toEqual({
			geminiSessionId: "gem-1",
			sandboxId: "sandbox-1",
			pendingRequestId: "req-1",
		});
	});

	it("adds the latest session state to provider options when building a chat body", () => {
		const body = buildGiselleChatRequestBody({
			id: "chat-1",
			trigger: "submit-message",
			messages: [
				{ role: "user" },
				{
					role: "assistant",
					metadata: createGiselleMessageMetadata({
						geminiSessionId: "gem-2",
						sandboxId: "sandbox-2",
						relaySessionId: "relay-2",
						relayToken: "token-2",
						relayUrl: "https://relay.example",
						pendingRequestId: "req-2",
					}),
				},
				{ role: "tool" },
			],
			body: {
				providerOptions: {
					giselle: {
						agent: { type: "gemini" },
					},
				},
			},
		});

		expect(body).toMatchObject({
			providerOptions: {
				giselle: {
					agent: { type: "gemini" },
					sessionState: {
						geminiSessionId: "gem-2",
						sandboxId: "sandbox-2",
						relaySessionId: "relay-2",
						relayToken: "token-2",
						relayUrl: "https://relay.example",
						pendingRequestId: "req-2",
					},
				},
			},
		});
	});
});
