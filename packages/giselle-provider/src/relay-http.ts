import type { RelaySubscription } from "./types";

const RELAY_HEADER_ENV_MAP = {
	"x-vercel-protection-bypass": "VERCEL_PROTECTION_BYPASS",
	"x-giselle-protection-bypass": "GISELLE_PROTECTION_BYPASS",
} as const;

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function toStringError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function buildRelayHeaders(): Record<string, string> {
	const headers: Record<string, string> = {};

	for (const [headerName, envName] of Object.entries(RELAY_HEADER_ENV_MAP)) {
		const value = process.env[envName]?.trim();
		if (value) {
			headers[headerName] = value;
		}
	}

	return headers;
}

function buildRelayEventsUrl(params: {
	relayUrl: string;
	sessionId: string;
	token: string;
}): string {
	const url = new URL(trimTrailingSlash(params.relayUrl));
	url.searchParams.set("sessionId", params.sessionId);
	url.searchParams.set("token", params.token);
	return url.toString();
}

function parseSseEventChunk(chunk: string): Record<string, unknown> | null {
	const dataLines: string[] = [];

	for (const line of chunk.split("\n")) {
		if (!line || line.startsWith(":")) {
			continue;
		}

		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).trimStart());
		}
	}

	if (dataLines.length === 0) {
		return null;
	}

	try {
		const parsed = JSON.parse(dataLines.join("\n"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}

		if ((parsed as { type?: unknown }).type === "ready") {
			return null;
		}

		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function createHttpRelaySubscription(params: {
	sessionId: string;
	token: string;
	relayUrl: string;
}): RelaySubscription {
	const waiters: Array<{
		resolve: (request: Record<string, unknown>) => void;
		reject: (error: Error) => void;
	}> = [];
	const queue: Record<string, unknown>[] = [];
	const abortController = new AbortController();
	let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	let closed = false;
	let startedSettled = false;
	let resolveStarted: () => void = () => undefined;
	let rejectStarted: (error: Error) => void = () => undefined;

	const started = new Promise<void>((resolve, reject) => {
		resolveStarted = () => {
			if (startedSettled) {
				return;
			}
			startedSettled = true;
			resolve();
		};
		rejectStarted = (error) => {
			if (startedSettled) {
				return;
			}
			startedSettled = true;
			reject(error);
		};
	});

	const resolveNext = (request: Record<string, unknown>): void => {
		const waiter = waiters.shift();
		if (waiter) {
			waiter.resolve(request);
			return;
		}

		queue.push(request);
	};

	const rejectAll = (error: Error): void => {
		while (waiters.length > 0) {
			waiters.shift()?.reject(error);
		}
	};

	const readerLoop = (async () => {
		const response = await fetch(
			buildRelayEventsUrl({
				relayUrl: params.relayUrl,
				sessionId: params.sessionId,
				token: params.token,
			}),
			{
				method: "GET",
				headers: buildRelayHeaders(),
				signal: abortController.signal,
			},
		);

		if (!response.ok || !response.body) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`Relay events failed (${response.status}): ${body || response.statusText}`,
			);
		}

		const streamReader = response.body.getReader();
		reader = streamReader;
		resolveStarted();

		const decoder = new TextDecoder();
		let buffer = "";

		while (!closed) {
			const { done, value } = await streamReader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");

			while (true) {
				const boundaryIndex = buffer.indexOf("\n\n");
				if (boundaryIndex < 0) {
					break;
				}

				const rawEvent = buffer.slice(0, boundaryIndex);
				buffer = buffer.slice(boundaryIndex + 2);

				const parsedEvent = parseSseEventChunk(rawEvent);
				if (parsedEvent) {
					resolveNext(parsedEvent);
				}
			}
		}

		buffer += decoder.decode().replace(/\r\n?/g, "\n");
		const trailingEvent = parseSseEventChunk(buffer.trim());
		if (trailingEvent) {
			resolveNext(trailingEvent);
		}

		if (!closed) {
			throw new Error("Relay event stream closed.");
		}
	})().catch((error) => {
		rejectStarted(new Error(`Relay subscription failed: ${toStringError(error)}`));
		if (!closed) {
			rejectAll(
				new Error(`Relay subscription failed: ${toStringError(error)}`),
			);
		}
		throw error;
	});

	return {
		nextRequest: async () => {
			await started;

			if (queue.length > 0) {
				return queue.shift() as Record<string, unknown>;
			}

			if (closed) {
				throw new Error("Relay subscription is closed.");
			}

			return await new Promise<Record<string, unknown>>((resolve, reject) => {
				waiters.push({ resolve, reject });
			});
		},
		close: async () => {
			if (closed) {
				return;
			}

			closed = true;
			abortController.abort();
			rejectAll(new Error("Relay subscription closed."));

			await reader?.cancel().catch(() => undefined);
			try {
				reader?.releaseLock();
			} catch {
				// ignore released lock
			}

			await readerLoop.catch(() => undefined);
		},
	};
}

export async function postRelayResponse(params: {
	relayUrl: string;
	sessionId: string;
	token: string;
	response: Record<string, unknown>;
}): Promise<void> {
	const response = await fetch(trimTrailingSlash(params.relayUrl), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...buildRelayHeaders(),
		},
		body: JSON.stringify({
			type: "relay.respond",
			sessionId: params.sessionId,
			token: params.token,
			response: params.response,
		}),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Relay response failed (${response.status}): ${body || response.statusText}`,
		);
	}
}
