export type GiselleSessionState = {
	geminiSessionId?: string;
	sandboxId?: string;
	relaySessionId?: string;
	relayToken?: string;
	relayUrl?: string;
	pendingRequestId?: string | null;
};

type GiselleMessageMetadata = {
	giselle?: {
		sessionState?: unknown;
	};
};

type GiselleProviderOptionsShape = {
	giselle?: {
		sessionId?: unknown;
		sessionState?: unknown;
	};
};

type GiselleSessionStateRawValue = {
	type?: unknown;
	sessionState?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function cloneRecord(value: unknown): Record<string, unknown> | undefined {
	const record = asRecord(value);
	return record ? { ...record } : undefined;
}

export function parseGiselleSessionState(
	value: unknown,
): GiselleSessionState | undefined {
	const record = asRecord(value);
	if (!record) {
		return undefined;
	}

	const sessionState: GiselleSessionState = {};

	const geminiSessionId = asNonEmptyString(record.geminiSessionId);
	if (geminiSessionId) {
		sessionState.geminiSessionId = geminiSessionId;
	}

	const sandboxId = asNonEmptyString(record.sandboxId);
	if (sandboxId) {
		sessionState.sandboxId = sandboxId;
	}

	const relaySessionId = asNonEmptyString(record.relaySessionId);
	if (relaySessionId) {
		sessionState.relaySessionId = relaySessionId;
	}

	const relayToken = asNonEmptyString(record.relayToken);
	if (relayToken) {
		sessionState.relayToken = relayToken;
	}

	const relayUrl = asNonEmptyString(record.relayUrl);
	if (relayUrl) {
		sessionState.relayUrl = relayUrl;
	}

	const pendingRequestId = record.pendingRequestId;
	if (pendingRequestId === null) {
		sessionState.pendingRequestId = null;
	} else {
		const parsedPendingRequestId = asNonEmptyString(pendingRequestId);
		if (parsedPendingRequestId) {
			sessionState.pendingRequestId = parsedPendingRequestId;
		}
	}

	return Object.keys(sessionState).length > 0 ? sessionState : undefined;
}

export function mergeGiselleSessionStates(
	base?: GiselleSessionState,
	updates?: Partial<GiselleSessionState>,
): GiselleSessionState | undefined {
	if (!base && !updates) {
		return undefined;
	}

	const next: GiselleSessionState = {
		...(base ?? {}),
	};

	if (!updates) {
		return Object.keys(next).length > 0 ? next : undefined;
	}

	if (updates.geminiSessionId !== undefined) {
		next.geminiSessionId = updates.geminiSessionId;
	}
	if (updates.sandboxId !== undefined) {
		next.sandboxId = updates.sandboxId;
	}
	if (updates.relaySessionId !== undefined) {
		next.relaySessionId = updates.relaySessionId;
	}
	if (updates.relayToken !== undefined) {
		next.relayToken = updates.relayToken;
	}
	if (updates.relayUrl !== undefined) {
		next.relayUrl = updates.relayUrl;
	}
	if (updates.pendingRequestId !== undefined) {
		next.pendingRequestId = updates.pendingRequestId;
	}

	return Object.keys(next).length > 0 ? next : undefined;
}

export function getGiselleSessionIdFromProviderOptions(
	providerOptions: unknown,
): string | undefined {
	if (!providerOptions || typeof providerOptions !== "object") {
		return undefined;
	}

	const typedProviderOptions = providerOptions as GiselleProviderOptionsShape;
	return asNonEmptyString(typedProviderOptions.giselle?.sessionId);
}

export function getGiselleSessionStateFromProviderOptions(
	providerOptions: unknown,
): GiselleSessionState | undefined {
	if (!providerOptions || typeof providerOptions !== "object") {
		return undefined;
	}

	const typedProviderOptions = providerOptions as GiselleProviderOptionsShape;
	return parseGiselleSessionState(typedProviderOptions.giselle?.sessionState);
}

export function createGiselleMessageMetadata(
	sessionState: GiselleSessionState,
): GiselleMessageMetadata {
	return {
		giselle: {
			sessionState,
		},
	};
}

export function getGiselleSessionStateFromMessageMetadata(
	metadata: unknown,
): GiselleSessionState | undefined {
	if (!metadata || typeof metadata !== "object") {
		return undefined;
	}

	const typedMetadata = metadata as GiselleMessageMetadata;
	return parseGiselleSessionState(typedMetadata.giselle?.sessionState);
}

export function getLatestGiselleSessionStateFromMessages(
	messages: Array<{ role?: unknown; metadata?: unknown }>,
): GiselleSessionState | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role !== "assistant") {
			continue;
		}

		const sessionState = getGiselleSessionStateFromMessageMetadata(
			message.metadata,
		);
		if (sessionState) {
			return sessionState;
		}
	}

	return undefined;
}

export function buildGiselleChatRequestBody(input: {
	id: string;
	messages: Array<{ role?: unknown; metadata?: unknown }>;
	trigger: "submit-message" | "regenerate-message";
	messageId?: string;
	body?: Record<string, unknown>;
}): Record<string, unknown> {
	const body: Record<string, unknown> = {
		...(input.body ?? {}),
		id: input.id,
		messages: input.messages,
		trigger: input.trigger,
		...(input.messageId ? { messageId: input.messageId } : {}),
	};

	const latestSessionState = getLatestGiselleSessionStateFromMessages(
		input.messages,
	);
	if (!latestSessionState) {
		return body;
	}

	const providerOptions = cloneRecord(body.providerOptions) ?? {};
	const giselleOptions = cloneRecord(providerOptions.giselle) ?? {};
	giselleOptions.sessionState = latestSessionState;
	providerOptions.giselle = giselleOptions;
	body.providerOptions = providerOptions;
	return body;
}

export function createGiselleSessionStateRawValue(
	sessionState: GiselleSessionState,
): {
	type: "giselle-session-state";
	sessionState: GiselleSessionState;
} {
	return {
		type: "giselle-session-state",
		sessionState,
	};
}

export function getGiselleSessionStateFromRawValue(
	rawValue: unknown,
): GiselleSessionState | undefined {
	const record = rawValue as GiselleSessionStateRawValue;
	if (record?.type !== "giselle-session-state") {
		return undefined;
	}

	return parseGiselleSessionState(record.sessionState);
}
