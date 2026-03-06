import type { RelayRequest, RelayResponse } from "@giselles-ai/browser-tool";
import type { CloudToolResult, PendingToolState } from "./cloud-chat-state";

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
							.fields as RelayResponse["fields"])
					: (input.result.output as RelayResponse["fields"]),
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
						.report as RelayResponse["report"])
				: (input.result.output as RelayResponse["report"]),
	};
}
