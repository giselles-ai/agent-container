import { z } from "zod";
import {
	browserToolActionSchema,
	type ExecutionReport,
	snapshotFieldSchema,
} from "../../types";
import type { BridgeClient } from "../bridge-client";

export const executeFormActionsInputShape = {
	actions: z.array(browserToolActionSchema),
	fields: z.array(snapshotFieldSchema),
};

const executeFormActionsInputSchema = z.object(executeFormActionsInputShape);

export type ExecuteFormActionsInput = z.infer<
	typeof executeFormActionsInputSchema
>;

export async function runExecuteFormActions(
	input: ExecuteFormActionsInput,
	bridgeClient: BridgeClient,
): Promise<ExecutionReport> {
	const parsed = executeFormActionsInputSchema.parse(input);

	return await bridgeClient.requestExecute({
		actions: parsed.actions,
		fields: parsed.fields,
	});
}
