import type { RelayRequest, RelayResponse } from "@giselles-ai/browser-tool";
import type { CloudToolResult, PendingToolState } from "./cloud-chat-state";

type SnapshotRelayResponse = Extract<
	RelayResponse,
	{ type: "snapshot_response" }
>;
type ExecuteRelayResponse = Extract<
	RelayResponse,
	{ type: "execute_response" }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unwrapRelayResult(output: unknown, key: "fields" | "report"): unknown {
	if (isRecord(output)) {
		if (key in output) {
			return output[key];
		}

		if ("value" in output) {
			return unwrapRelayResult(output.value, key);
		}
	}

	if (
		Array.isArray(output) &&
		output.length === 1 &&
		isRecord(output[0]) &&
		output[0].type === "text" &&
		typeof output[0].text === "string"
	) {
		try {
			return unwrapRelayResult(JSON.parse(output[0].text), key);
		} catch {
			return output;
		}
	}

	return output;
}

export function relayRequestToPendingTool(
	request: RelayRequest,
): PendingToolState {
	return {
		requestId: request.requestId,
		requestType: request.type,
		toolName:
			request.type === "snapshot_request"
				? "getFormSnapshot"
				: "executeFormActions",
	};
}

export function relayRequestToNdjsonEvent(
	request: RelayRequest,
): Record<string, unknown> {
	return request;
}

export function toolResultToRelayResponse(input: {
	pending: PendingToolState;
	result: CloudToolResult;
}): RelayResponse {
	if (input.pending.requestType === "snapshot_request") {
		return {
			type: "snapshot_response",
			requestId: input.pending.requestId,
			fields: unwrapRelayResult(
				input.result.output,
				"fields",
			) as SnapshotRelayResponse["fields"],
		};
	}

	return {
		type: "execute_response",
		requestId: input.pending.requestId,
		report: unwrapRelayResult(
			input.result.output,
			"report",
		) as ExecuteRelayResponse["report"],
	};
}
