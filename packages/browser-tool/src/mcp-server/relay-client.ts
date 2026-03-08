import { randomUUID } from "node:crypto";
import {
	type BrowserToolAction,
	dispatchErrorSchema,
	dispatchSuccessSchema,
	type ExecutionReport,
	type RelayRequest,
	type RelayResponse,
	relayRequestSchema,
	relayResponseSchema,
	type SnapshotField,
} from "../types";

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

function trimTrailingSlash(input: string): string {
	return input.replace(/\/+$/, "");
}

function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export class RelayClient {
	private readonly url: string;
	private readonly sessionId: string;
	private readonly token: string;
	private readonly timeoutMs: number;
	private readonly extraHeaders: Record<string, string>;

	constructor(input: {
		url: string;
		sessionId: string;
		token: string;
		timeoutMs?: number;
		extraHeaders?: Record<string, string>;
	}) {
		this.url = trimTrailingSlash(input.url);
		this.sessionId = input.sessionId;
		this.token = input.token;
		this.timeoutMs = input.timeoutMs ?? 20_000;
		this.extraHeaders = input.extraHeaders ?? {};
	}

	async requestSnapshot(input: {
		instruction: string;
		document?: string;
	}): Promise<SnapshotField[]> {
		const response = await this.dispatch({
			type: "snapshot_request",
			requestId: randomUUID(),
			instruction: input.instruction,
			document: input.document,
		});

		if (response.type !== "snapshot_response") {
			throw new Error(`Unexpected relay response type: ${response.type}`);
		}

		return response.fields;
	}

	async requestExecute(input: {
		actions: BrowserToolAction[];
		fields: SnapshotField[];
	}): Promise<ExecutionReport> {
		const response = await this.dispatch({
			type: "execute_request",
			requestId: randomUUID(),
			actions: input.actions,
			fields: input.fields,
		});

		if (response.type !== "execute_response") {
			throw new Error(`Unexpected relay response type: ${response.type}`);
		}

		return response.report;
	}

	private async dispatch(request: RelayRequest): Promise<RelayResponse> {
		const payload = relayRequestSchema.parse(request);
		let response: Response;

		try {
			const headers: Record<string, string> = {
				"content-type": "application/json",
				...this.extraHeaders,
			};

			response = await fetch(`${this.url}`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					type: "relay.dispatch",
					sessionId: this.sessionId,
					token: this.token,
					timeoutMs: this.timeoutMs,
					request: payload,
				}),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				[
					"Relay dispatch network request failed.",
					`url=${this.url}`,
					"Ensure BROWSER_TOOL_RELAY_URL is reachable from the sandbox runtime.",
					`cause=${message}`,
				].join(" "),
			);
		}

		const body = await response.json().catch(() => null);

		const failure = dispatchErrorSchema.safeParse(body);
		if (failure.success) {
			throw new Error(`[${failure.data.errorCode}] ${failure.data.message}`);
		}

		const success = dispatchSuccessSchema.safeParse(body);
		if (!success.success) {
			throw new Error(
				[
					"Relay dispatch returned an unexpected payload.",
					`status=${response.status}`,
					`url=${this.url}`,
					`body=${safeJsonStringify(body)}`,
				].join(" "),
			);
		}

		if (!response.ok) {
			throw new Error(`Relay dispatch failed with HTTP ${response.status}.`);
		}

		const parsedResponse = relayResponseSchema.parse(success.data.response);
		return parsedResponse;
	}
}

function parseRelayHeaders(): Record<string, string> {
	const raw = process.env.BROWSER_TOOL_RELAY_HEADERS?.trim();
	if (!raw) {
		return {};
	}
	try {
		return JSON.parse(raw) as Record<string, string>;
	} catch {
		console.error(
			"[relay-client] Failed to parse BROWSER_TOOL_RELAY_HEADERS, ignoring.",
		);
		return {};
	}
}

export function createRelayClientFromEnv(): RelayClient {
	const extraHeaders = parseRelayHeaders();
	console.error(
		`[relay-client] BROWSER_TOOL_RELAY_HEADERS keys=${Object.keys(extraHeaders).join(", ") || "(none)"}`,
	);

	return new RelayClient({
		url: requiredEnv("BROWSER_TOOL_RELAY_URL"),
		sessionId: requiredEnv("BROWSER_TOOL_RELAY_SESSION_ID"),
		token: requiredEnv("BROWSER_TOOL_RELAY_TOKEN"),
		extraHeaders,
	});
}
