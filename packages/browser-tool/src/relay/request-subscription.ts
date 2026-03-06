import {
	type RelayRequest,
	type RelayResponse,
	relayRequestSchema,
} from "../types";
import {
	assertRelaySession,
	createRelaySubscriber,
	relayRequestChannel,
	resolveRelayResponse,
} from "./relay-store";

export type RelayRequestSubscription = {
	nextRequest(): Promise<RelayRequest>;
	close(): Promise<void>;
};

export async function createRelayRequestSubscription(input: {
	sessionId: string;
	token: string;
}): Promise<RelayRequestSubscription> {
	await assertRelaySession(input.sessionId, input.token);
	const subscriber = createRelaySubscriber();
	const channel = relayRequestChannel(input.sessionId);
	await subscriber.subscribe(channel);

	const nextRequest = () => {
		return new Promise<RelayRequest>((resolve, reject) => {
			const onMessage = (_channel: string, message: string) => {
				if (_channel !== channel) {
					return;
				}

				let parsed: RelayRequest | null = null;
				try {
					const raw = JSON.parse(message) as unknown;
					const safe = relayRequestSchema.safeParse(raw);
					if (!safe.success) {
						return;
					}
					parsed = safe.data;
				} catch {
					return;
				}

				cleanup();
				resolve(parsed);
			};

			const onError = (error: unknown) => {
				cleanup();
				reject(error);
			};

			const cleanup = () => {
				subscriber.off("message", onMessage);
				subscriber.off("error", onError);
			};

			subscriber.on("message", onMessage);
			subscriber.on("error", onError);
		});
	};

	const close = async (): Promise<void> => {
		await subscriber.unsubscribe(channel).catch(() => undefined);
		await subscriber.quit().catch(() => {
			subscriber.disconnect();
		});
	};

	return {
		nextRequest,
		close,
	};
}

export async function sendRelayResponse(input: {
	sessionId: string;
	token: string;
	response: RelayResponse;
}): Promise<void> {
	await resolveRelayResponse(input);
}
