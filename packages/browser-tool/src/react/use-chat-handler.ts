"use client";

import { useCallback, useRef } from "react";
import type { BrowserToolAction, SnapshotField } from "..";
import { execute, snapshot } from "../dom";

type ToolCallInfo = {
	toolName: string;
	toolCallId: string;
	input?: unknown;
	dynamic?: boolean;
};

type ToolOutputSuccess = {
	tool: string;
	toolCallId: string;
	output: unknown;
};

type ToolOutputError = {
	state: "output-error";
	tool: string;
	toolCallId: string;
	errorText: string;
};

type AddToolOutputFn = (output: ToolOutputSuccess | ToolOutputError) => void;

export type BrowserToolChatHandler = {
	onToolCall: (options: { toolCall: ToolCallInfo }) => Promise<void>;
	connect: (addToolOutput: AddToolOutputFn) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function parseExecuteInput(value: unknown): {
	actions: BrowserToolAction[];
	fields: SnapshotField[];
} {
	if (!isRecord(value)) {
		return { actions: [], fields: [] };
	}

	return {
		actions: Array.isArray(value.actions)
			? (value.actions as BrowserToolAction[])
			: [],
		fields: Array.isArray(value.fields)
			? (value.fields as SnapshotField[])
			: [],
	};
}

/**
 * Hook that encapsulates browser-tool handling for `useChat`'s `onToolCall`.
 *
 * Usage:
 * ```ts
 * const browserTool = useBrowserToolHandler();
 * const { addToolOutput, ...chat } = useChat({
 *   sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
 *   ...browserTool,
 * });
 * browserTool.connect(addToolOutput);
 * ```
 */
export function useBrowserToolHandler(options?: {
	onWarnings?: (warnings: string[]) => void;
}): BrowserToolChatHandler {
	const addToolOutputRef = useRef<AddToolOutputFn | undefined>(undefined);
	const onWarningsRef = useRef(options?.onWarnings);
	onWarningsRef.current = options?.onWarnings;

	const onToolCall = useCallback(
		async ({ toolCall }: { toolCall: ToolCallInfo }) => {
			const addToolOutput = addToolOutputRef.current;
			if (!addToolOutput || toolCall.dynamic) {
				return;
			}

			try {
				if (toolCall.toolName === "getFormSnapshot") {
					const fields = snapshot();
					addToolOutput({
						tool: "getFormSnapshot",
						toolCallId: toolCall.toolCallId,
						output: { fields },
					});
					return;
				}

				if (toolCall.toolName === "executeFormActions") {
					const { actions, fields } = parseExecuteInput(toolCall.input);
					const report = execute(actions, fields);
					if (report.warnings.length > 0) {
						onWarningsRef.current?.(report.warnings);
					}
					addToolOutput({
						tool: "executeFormActions",
						toolCallId: toolCall.toolCallId,
						output: { report },
					});
					return;
				}

				addToolOutput({
					state: "output-error",
					tool: toolCall.toolName,
					toolCallId: toolCall.toolCallId,
					errorText: `Unknown tool: ${toolCall.toolName}`,
				});
			} catch (error) {
				addToolOutput({
					state: "output-error",
					tool: toolCall.toolName,
					toolCallId: toolCall.toolCallId,
					errorText:
						error instanceof Error ? error.message : "Tool execution failed.",
				});
			}
		},
		[],
	);

	const connect = useCallback((addToolOutput: AddToolOutputFn) => {
		addToolOutputRef.current = addToolOutput;
	}, []);

	return { onToolCall, connect };
}
