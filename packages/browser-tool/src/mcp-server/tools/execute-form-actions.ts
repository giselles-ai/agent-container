import { z } from "zod";
import {
	browserToolActionSchema,
	type ExecutionReport,
	snapshotFieldSchema,
} from "../../types";
import type { RelayClient } from "../relay-client";

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
	relayClient: RelayClient,
): Promise<ExecutionReport> {
	const parsed = executeFormActionsInputSchema.parse(input);

	return await relayClient.requestExecute({
		actions: parsed.actions,
		fields: parsed.fields,
	});
}
