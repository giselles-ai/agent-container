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

export class RelayClient {
	private readonly url: string;
	private readonly sessionId: string;
	private readonly token: string;
	private readonly timeoutMs: number;
	private readonly vercelProtectionBypass: string | null;
	private readonly giselleProtectionBypass: string | null;

	constructor(input: {
		url: string;
		sessionId: string;
		token: string;
		timeoutMs?: number;
		vercelProtectionBypass?: string;
		giselleProtectionBypass?: string;
	}) {
		this.url = trimTrailingSlash(input.url);
		this.sessionId = input.sessionId;
		this.token = input.token;
		this.timeoutMs = input.timeoutMs ?? 20_000;
		this.vercelProtectionBypass = input.vercelProtectionBypass?.trim() || null;
		this.giselleProtectionBypass =
			input.giselleProtectionBypass?.trim() || null;
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
			};
			if (this.vercelProtectionBypass) {
				headers["x-vercel-protection-bypass"] = this.vercelProtectionBypass;
			}
			if (this.giselleProtectionBypass) {
				headers["x-giselle-protection-bypass"] = this.giselleProtectionBypass;
			}

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
			throw new Error("Relay dispatch returned an unexpected payload.");
		}

		if (!response.ok) {
			throw new Error(`Relay dispatch failed with HTTP ${response.status}.`);
		}

		const parsedResponse = relayResponseSchema.parse(success.data.response);
		return parsedResponse;
	}
}

export function createRelayClientFromEnv(): RelayClient {
	const vercelProtectionBypass = process.env.VERCEL_PROTECTION_BYPASS;
	const giselleProtectionBypass = process.env.GISELLE_PROTECTION_BYPASS;
	console.error(
		`[relay-client] VERCEL_PROTECTION_BYPASS=${vercelProtectionBypass?.trim() ? "(set)" : "(unset)"}`,
	);
	console.error(
		`[relay-client] GISELLE_PROTECTION_BYPASS=${giselleProtectionBypass?.trim() ? "(set)" : "(unset)"}`,
	);

	return new RelayClient({
		url: requiredEnv("BROWSER_TOOL_RELAY_URL"),
		sessionId: requiredEnv("BROWSER_TOOL_RELAY_SESSION_ID"),
		token: requiredEnv("BROWSER_TOOL_RELAY_TOKEN"),
		vercelProtectionBypass,
		giselleProtectionBypass,
	});
}
