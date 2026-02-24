import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { SessionMetadata } from "./types";

type CloudApiEvent = {
	type?: string;
	[key: string]: unknown;
};

const textBlockIdByContext = new WeakMap<NdjsonMapperContext, string>();

export type NdjsonMapperContext = {
	textBlockOpen: boolean;
	lastAssistantContent: string;
};

export type MapResult = {
	parts: LanguageModelV3StreamPart[];
	sessionUpdate?: Partial<SessionMetadata>;
	relayRequest?: Record<string, unknown>;
};

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}
	return undefined;
}

function createZeroUsage(): {
	inputTokens: {
		total: number;
		noCache: number;
		cacheRead: number;
		cacheWrite: number;
	};
	outputTokens: {
		total: number;
		text: number;
		reasoning: number;
	};
} {
	return {
		inputTokens: {
			total: 0,
			noCache: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		outputTokens: {
			total: 0,
			text: 0,
			reasoning: 0,
		},
	};
}

function getTextBlockId(context: NdjsonMapperContext): string {
	const existing = textBlockIdByContext.get(context);
	if (existing) {
		return existing;
	}
	const next = crypto.randomUUID();
	textBlockIdByContext.set(context, next);
	return next;
}

function closeTextBlock(
	context: NdjsonMapperContext,
	parts: LanguageModelV3StreamPart[],
): void {
	if (!context.textBlockOpen) {
		return;
	}

	parts.push({
		type: "text-end",
		id: getTextBlockId(context),
	});
	context.textBlockOpen = false;
	context.lastAssistantContent = "";
	textBlockIdByContext.delete(context);
}

function finishToolCalls(parts: LanguageModelV3StreamPart[]): void {
	parts.push({
		type: "finish",
		finishReason: {
			unified: "tool-calls",
			raw: undefined,
		},
		usage: createZeroUsage(),
	});
}

function finishStop(parts: LanguageModelV3StreamPart[]): void {
	parts.push({
		type: "finish",
		finishReason: {
			unified: "stop",
			raw: undefined,
		},
		usage: createZeroUsage(),
	});
}

export function extractJsonObjects(buffer: string): {
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

export function createMapperContext(): NdjsonMapperContext {
	return {
		textBlockOpen: false,
		lastAssistantContent: "",
	};
}

export function mapNdjsonEvent(
	event: CloudApiEvent,
	context: NdjsonMapperContext,
): MapResult {
	const parts: LanguageModelV3StreamPart[] = [];

	if (typeof event.type !== "string") {
		return { parts };
	}

	if (event.type === "message") {
		const role = asString(event.role);
		if (role !== "assistant") {
			return { parts };
		}

		const content = asString(event.content) ?? "";
		const isDelta = asBoolean(event.delta) === true;

		if (isDelta) {
			if (!context.textBlockOpen) {
				parts.push({
					type: "text-start",
					id: getTextBlockId(context),
				});
				context.textBlockOpen = true;
			}

			parts.push({
				type: "text-delta",
				id: getTextBlockId(context),
				delta: content,
			});
			context.lastAssistantContent = `${context.lastAssistantContent}${content}`;
			return { parts };
		}

		if (context.textBlockOpen) {
			closeTextBlock(context, parts);
		}

		if (content.length === 0) {
			return { parts };
		}

		const textBlockId = getTextBlockId(context);
		context.textBlockOpen = true;
		parts.push({
			type: "text-start",
			id: textBlockId,
		});
		parts.push({
			type: "text-delta",
			id: textBlockId,
			delta: content,
		});
		parts.push({
			type: "text-end",
			id: textBlockId,
		});
		context.textBlockOpen = false;
		context.lastAssistantContent = "";
		textBlockIdByContext.delete(context);
		return { parts };
	}

	if (event.type === "init") {
		const modelId = asString(event.modelId);
		parts.push({
			type: "response-metadata",
			...(modelId ? { modelId } : {}),
		});

		const geminiSessionId = asString(event.session_id);
		if (!geminiSessionId) {
			return { parts };
		}
		return {
			parts,
			sessionUpdate: {
				geminiSessionId,
			},
		};
	}

	if (event.type === "sandbox") {
		parts.push({
			type: "response-metadata",
		});

		const sandboxId = asString(event.sandbox_id);
		if (!sandboxId) {
			return { parts };
		}
		return {
			parts,
			sessionUpdate: {
				sandboxId,
			},
		};
	}

	if (event.type === "relay.session") {
		const relaySessionId = asString(event.sessionId);
		const relayToken = asString(event.token);
		const relayUrl = asString(event.relayUrl);
		if (!relaySessionId || !relayToken || !relayUrl) {
			return { parts };
		}
		return {
			parts,
			sessionUpdate: {
				relaySessionId,
				relayToken,
				relayUrl,
			},
		};
	}

	if (event.type === "snapshot_request") {
		closeTextBlock(context, parts);

		const requestId = asString(event.requestId);
		if (!requestId) {
			return { parts };
		}

		parts.push({
			type: "tool-call",
			toolCallId: requestId,
			toolName: "getFormSnapshot",
			input: JSON.stringify({
				instruction: event.instruction,
				document: event.document,
			}),
		});
		finishToolCalls(parts);
		return {
			parts,
			sessionUpdate: {
				pendingRequestId: requestId,
			},
			relayRequest: event,
		};
	}

	if (event.type === "execute_request") {
		closeTextBlock(context, parts);

		const requestId = asString(event.requestId);
		if (!requestId) {
			return { parts };
		}

		parts.push({
			type: "tool-call",
			toolCallId: requestId,
			toolName: "executeFormActions",
			input: JSON.stringify({
				actions: event.actions,
				fields: event.fields,
			}),
		});
		finishToolCalls(parts);
		return {
			parts,
			sessionUpdate: {
				pendingRequestId: requestId,
			},
			relayRequest: event,
		};
	}

	return { parts };
}

export function finishStream(
	context: NdjsonMapperContext,
): LanguageModelV3StreamPart[] {
	const parts: LanguageModelV3StreamPart[] = [];
	closeTextBlock(context, parts);
	finishStop(parts);
	return parts;
}
