import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayRequest } from "../types";

const relayStoreMocks = vi.hoisted(() => {
	type MessageHandler = (channel: string, message: string) => void;
	type ErrorHandler = (error: unknown) => void;

	const handlers = {
		message: new Set<MessageHandler>(),
		error: new Set<ErrorHandler>(),
	};

	const subscriber = {
		subscribe: vi.fn(async () => undefined),
		unsubscribe: vi.fn(async () => undefined),
		quit: vi.fn(async () => undefined),
		disconnect: vi.fn(),
		on: vi.fn(
			(
				event: "message" | "error",
				handler: MessageHandler | ErrorHandler,
			) => {
				if (event === "message") {
					handlers.message.add(handler as MessageHandler);
					return;
				}
				handlers.error.add(handler as ErrorHandler);
			},
		),
		off: vi.fn(
			(
				event: "message" | "error",
				handler: MessageHandler | ErrorHandler,
			) => {
				if (event === "message") {
					handlers.message.delete(handler as MessageHandler);
					return;
				}
				handlers.error.delete(handler as ErrorHandler);
			},
		),
	};

	return {
		assertRelaySession: vi.fn(async () => undefined),
		createRelaySubscriber: vi.fn(() => subscriber),
		markBrowserConnected: vi.fn(async () => undefined),
		touchBrowserConnected: vi.fn(async () => undefined),
		resolveRelayResponse: vi.fn(async () => undefined),
		relayRequestChannel: vi.fn((sessionId: string) => `relay:${sessionId}:request`),
		RELAY_SSE_KEEPALIVE_INTERVAL_MS: 20_000,
		handlers,
		subscriber,
	};
});

vi.mock("./relay-store", () => ({
	assertRelaySession: relayStoreMocks.assertRelaySession,
	createRelaySubscriber: relayStoreMocks.createRelaySubscriber,
	markBrowserConnected: relayStoreMocks.markBrowserConnected,
	touchBrowserConnected: relayStoreMocks.touchBrowserConnected,
	resolveRelayResponse: relayStoreMocks.resolveRelayResponse,
	relayRequestChannel: relayStoreMocks.relayRequestChannel,
	RELAY_SSE_KEEPALIVE_INTERVAL_MS:
		relayStoreMocks.RELAY_SSE_KEEPALIVE_INTERVAL_MS,
}));

import {
	createRelayRequestSubscription,
	sendRelayResponse,
} from "./request-subscription";

describe("createRelayRequestSubscription", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		relayStoreMocks.assertRelaySession.mockClear();
		relayStoreMocks.createRelaySubscriber.mockClear();
		relayStoreMocks.markBrowserConnected.mockClear();
		relayStoreMocks.touchBrowserConnected.mockClear();
		relayStoreMocks.resolveRelayResponse.mockClear();
		relayStoreMocks.relayRequestChannel.mockClear();
		relayStoreMocks.subscriber.subscribe.mockClear();
		relayStoreMocks.subscriber.unsubscribe.mockClear();
		relayStoreMocks.subscriber.quit.mockClear();
		relayStoreMocks.subscriber.disconnect.mockClear();
		relayStoreMocks.subscriber.on.mockClear();
		relayStoreMocks.subscriber.off.mockClear();
		relayStoreMocks.handlers.message.clear();
		relayStoreMocks.handlers.error.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("marks the cloud relay consumer as connected and keeps it alive", async () => {
		const subscription = await createRelayRequestSubscription({
			sessionId: "session-1",
			token: "token-1",
		});

		expect(relayStoreMocks.assertRelaySession).toHaveBeenCalledWith(
			"session-1",
			"token-1",
		);
		expect(relayStoreMocks.createRelaySubscriber).toHaveBeenCalledTimes(1);
		expect(relayStoreMocks.subscriber.subscribe).toHaveBeenCalledWith(
			"relay:session-1:request",
		);
		expect(relayStoreMocks.markBrowserConnected).toHaveBeenCalledWith(
			"session-1",
			"token-1",
		);

		await vi.advanceTimersByTimeAsync(20_000);
		expect(relayStoreMocks.touchBrowserConnected).toHaveBeenCalledWith(
			"session-1",
		);

		await subscription.close();
		expect(relayStoreMocks.subscriber.unsubscribe).toHaveBeenCalledWith(
			"relay:session-1:request",
		);
		expect(relayStoreMocks.subscriber.quit).toHaveBeenCalledTimes(1);
	});

	it("resolves the next relay request from the subscription channel", async () => {
		const subscription = await createRelayRequestSubscription({
			sessionId: "session-2",
			token: "token-2",
		});

		const nextRequestPromise = subscription.nextRequest();
		const request: RelayRequest = {
			type: "snapshot_request",
			requestId: "req-1",
			instruction: "Inspect the sheet",
		};

		for (const handler of relayStoreMocks.handlers.message) {
			handler("relay:session-2:request", JSON.stringify(request));
		}

		await expect(nextRequestPromise).resolves.toEqual(request);
		expect(relayStoreMocks.subscriber.off).toHaveBeenCalled();

		await subscription.close();
	});
});

describe("sendRelayResponse", () => {
	it("delegates to resolveRelayResponse", async () => {
		await sendRelayResponse({
			sessionId: "session-3",
			token: "token-3",
			response: {
				type: "snapshot_response",
				requestId: "req-3",
				fields: [],
			},
		});

		expect(relayStoreMocks.resolveRelayResponse).toHaveBeenCalledWith({
			sessionId: "session-3",
			token: "token-3",
			response: {
				type: "snapshot_response",
				requestId: "req-3",
				fields: [],
			},
		});
	});
});
