import { randomUUID } from "node:crypto";
import {
	type BridgeRequest,
	type BridgeResponse,
	bridgeRequestSchema,
	bridgeResponseSchema,
	dispatchErrorSchema,
	dispatchSuccessSchema,
	type ExecutionReport,
	type RpaAction,
	type SnapshotField,
} from "@giselles/rpa-sdk";

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

export class BridgeClient {
	private readonly baseUrl: string;
	private readonly sessionId: string;
	private readonly token: string;
	private readonly timeoutMs: number;
	private readonly vercelProtectionBypass: string | null;
	private readonly giselleProtectionBypass: string | null;

	constructor(input: {
		baseUrl: string;
		sessionId: string;
		token: string;
		timeoutMs?: number;
		vercelProtectionBypass?: string;
		giselleProtectionBypass?: string;
	}) {
		this.baseUrl = trimTrailingSlash(input.baseUrl);
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
			throw new Error(`Unexpected bridge response type: ${response.type}`);
		}

		return response.fields;
	}

	async requestExecute(input: {
		actions: RpaAction[];
		fields: SnapshotField[];
	}): Promise<ExecutionReport> {
		const response = await this.dispatch({
			type: "execute_request",
			requestId: randomUUID(),
			actions: input.actions,
			fields: input.fields,
		});

		if (response.type !== "execute_response") {
			throw new Error(`Unexpected bridge response type: ${response.type}`);
		}

		return response.report;
	}

	private async dispatch(request: BridgeRequest): Promise<BridgeResponse> {
		const payload = bridgeRequestSchema.parse(request);
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

			response = await fetch(`${this.baseUrl}/api/gemini-rpa/bridge/dispatch`, {
				method: "POST",
				headers,
				body: JSON.stringify({
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
					"Bridge dispatch network request failed.",
					`baseUrl=${this.baseUrl}`,
					"Ensure RPA_BRIDGE_BASE_URL is reachable from the sandbox runtime.",
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
			throw new Error("Bridge dispatch returned an unexpected payload.");
		}

		if (!response.ok) {
			throw new Error(`Bridge dispatch failed with HTTP ${response.status}.`);
		}

		const parsedResponse = bridgeResponseSchema.parse(success.data.response);
		return parsedResponse;
	}
}

export function createBridgeClientFromEnv(): BridgeClient {
	const vercelProtectionBypass = process.env.VERCEL_PROTECTION_BYPASS;
	const giselleProtectionBypass = process.env.GISELLE_PROTECTION_BYPASS;
	console.error(
		`[bridge-client] VERCEL_PROTECTION_BYPASS=${vercelProtectionBypass?.trim() ? "(set)" : "(unset)"}`,
	);
	console.error(
		`[bridge-client] GISELLE_PROTECTION_BYPASS=${giselleProtectionBypass?.trim() ? "(set)" : "(unset)"}`,
	);

	return new BridgeClient({
		baseUrl: requiredEnv("RPA_BRIDGE_BASE_URL"),
		sessionId: requiredEnv("RPA_BRIDGE_SESSION_ID"),
		token: requiredEnv("RPA_BRIDGE_TOKEN"),
		vercelProtectionBypass,
		giselleProtectionBypass,
	});
}
