import type { RelayRequest, RelayResponse } from "@giselles-ai/browser-tool";
import type { CloudToolResult, PendingToolState } from "./cloud-chat-state";

type SnapshotRelayResponse = Extract<
	RelayResponse,
	{ type: "snapshot_response" }
>;
type ExecuteRelayResponse = Extract<RelayResponse, { type: "execute_response" }>;

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
			fields:
				typeof input.result.output === "object" &&
				input.result.output !== null &&
				"fields" in (input.result.output as Record<string, unknown>)
					? ((input.result.output as Record<string, unknown>)
							.fields as SnapshotRelayResponse["fields"])
					: (input.result.output as SnapshotRelayResponse["fields"]),
		};
	}

	return {
		type: "execute_response",
		requestId: input.pending.requestId,
		report:
			typeof input.result.output === "object" &&
			input.result.output !== null &&
			"report" in (input.result.output as Record<string, unknown>)
				? ((input.result.output as Record<string, unknown>)
						.report as ExecuteRelayResponse["report"])
				: (input.result.output as ExecuteRelayResponse["report"]),
	};
}
