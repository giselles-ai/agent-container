export type StreamAgentEvent = {
	type?: string;
	[key: string]: unknown;
};

export type StreamAgentOptions = {
	endpoint: string;
	message: string;
	document?: string;
	sessionId?: string;
	sandboxId?: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
};

function extractJsonObjects(buffer: string): {
	objects: string[];
	rest: string;
} {
	const objects: string[] = [];
	let depth = 0;
	let inString = false;
	let escaped = false;
	let startIndex = -1;

	for (let index = 0; index < buffer.length; index += 1) {
		const char = buffer[index];

		if (escaped) {
			escaped = false;
			continue;
		}

		if (char === "\\") {
			escaped = true;
			continue;
		}

		if (char === '"') {
			inString = !inString;
			continue;
		}

		if (inString) {
			continue;
		}

		if (char === "{") {
			if (depth === 0) {
				startIndex = index;
			}
			depth += 1;
			continue;
		}

		if (char === "}") {
			depth -= 1;
			if (depth === 0 && startIndex >= 0) {
				objects.push(buffer.slice(startIndex, index + 1));
				startIndex = -1;
			}
		}
	}

	if (depth > 0 && startIndex >= 0) {
		return { objects, rest: buffer.slice(startIndex) };
	}

	return { objects, rest: "" };
}

export function toNdjsonResponse(
	events: AsyncIterable<StreamAgentEvent>,
): Response {
	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const event of events) {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				}
				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
		},
	});
}

export async function* streamAgent(
	options: StreamAgentOptions,
): AsyncGenerator<StreamAgentEvent> {
	const response = await fetch(options.endpoint, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...options.headers,
		},
		body: JSON.stringify({
			type: "agent.run",
			message: options.message,
			document: options.document,
			session_id: options.sessionId,
			sandbox_id: options.sandboxId,
		}),
		signal: options.signal,
	});

	if (!response.ok || !response.body) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Agent request failed (${response.status}): ${body || response.statusText}`,
		);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const parsed = extractJsonObjects(buffer);
			buffer = parsed.rest;

			for (const text of parsed.objects) {
				try {
					yield JSON.parse(text) as StreamAgentEvent;
				} catch {
					// Skip malformed chunks.
				}
			}
		}

		if (buffer.trim().length > 0) {
			try {
				yield JSON.parse(buffer) as StreamAgentEvent;
			} catch {
				// Ignore trailing partial buffer.
			}
		}
	} finally {
		reader.releaseLock();
	}
}
