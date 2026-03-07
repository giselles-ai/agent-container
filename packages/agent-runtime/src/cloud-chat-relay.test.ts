import { describe, expect, it } from "vitest";
import { toolResultToRelayResponse } from "./cloud-chat-relay";

describe("toolResultToRelayResponse", () => {
	it("unwraps snapshot fields from AI SDK json tool output", () => {
		expect(
			toolResultToRelayResponse({
				pending: {
					requestId: "req-1",
					requestType: "snapshot_request",
					toolName: "getFormSnapshot",
				},
				result: {
					toolCallId: "req-1",
					toolName: "getFormSnapshot",
					output: {
						type: "json",
						value: {
							fields: [
								{
									fieldId: "bt:header-0",
									selector: "[data-browser-tool-id=\"header-0\"]",
									kind: "text",
									label: "Header column 1",
									required: false,
									currentValue: "",
								},
							],
						},
					},
				},
			}),
		).toEqual({
			type: "snapshot_response",
			requestId: "req-1",
			fields: [
				{
					fieldId: "bt:header-0",
					selector: "[data-browser-tool-id=\"header-0\"]",
					kind: "text",
					label: "Header column 1",
					required: false,
					currentValue: "",
				},
			],
		});
	});

	it("unwraps execute reports from AI SDK json tool output", () => {
		expect(
			toolResultToRelayResponse({
				pending: {
					requestId: "req-2",
					requestType: "execute_request",
					toolName: "executeFormActions",
				},
				result: {
					toolCallId: "req-2",
					toolName: "executeFormActions",
					output: {
						type: "json",
						value: {
							report: {
								applied: 3,
								skipped: 0,
								warnings: [],
							},
						},
					},
				},
			}),
		).toEqual({
			type: "execute_response",
			requestId: "req-2",
			report: {
				applied: 3,
				skipped: 0,
				warnings: [],
			},
		});
	});
});
