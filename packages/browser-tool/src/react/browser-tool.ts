import type { BrowserToolAction, SnapshotField } from "../";
import { execute, snapshot } from "../dom";

type StreamEvent = {
	type?: string;
	requestId?: unknown;
	[key: string]: unknown;
};

type AgentToolContext = {
	sendRelayResponse: (payload: Record<string, unknown>) => Promise<void>;
	setError: (message: string) => void;
	addWarnings: (warnings: string[]) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function parseActions(value: unknown): BrowserToolAction[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const actions = value.filter((item): item is BrowserToolAction => {
		if (!isRecord(item) || typeof item.action !== "string") {
			return false;
		}
		if (typeof item.fieldId !== "string") {
			return false;
		}
		if (item.action === "click") {
			return true;
		}
		if (
			(item.action === "fill" || item.action === "select") &&
			typeof item.value === "string"
		) {
			return true;
		}
		return false;
	});

	return actions as BrowserToolAction[];
}

function parseFields(value: unknown): SnapshotField[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(
		(item): item is SnapshotField =>
			isRecord(item) &&
			typeof item.fieldId === "string" &&
			typeof item.kind === "string" &&
			typeof item.selector === "string",
	) as SnapshotField[];
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : "Request failed.";
}

export type BrowserToolRelayHandler = {
	handleRelayRequest: (
		event: StreamEvent,
		context: AgentToolContext,
	) => Promise<boolean>;
};

export function browserTool(): BrowserToolRelayHandler {
	return {
		handleRelayRequest: async (event, context) => {
			if (!isRecord(event) || typeof event.type !== "string") {
				return false;
			}

			const requestId = asString(event.requestId);
			if (!requestId) {
				return false;
			}

			if (event.type === "snapshot_request") {
				try {
					const fields = snapshot();
					await context.sendRelayResponse({
						type: "snapshot_response",
						requestId,
						fields,
					});
					return true;
				} catch (error) {
					context.setError(formatError(error));
					throw error;
				}
			}

			if (event.type === "execute_request") {
				const actions = parseActions(event.actions);
				const fields = parseFields(event.fields);
				const report = execute(actions, fields);
				if (Array.isArray(report.warnings)) {
					context.addWarnings(report.warnings);
				}

				await context.sendRelayResponse({
					type: "execute_response",
					requestId,
					report: {
						applied: report.applied,
						skipped: report.skipped,
						warnings: report.warnings,
					},
				});
				return true;
			}

			return false;
		},
	};
}
