import { z } from "zod";
import {
	type ExecutionReport,
	rpaActionSchema,
	snapshotFieldSchema,
} from "../../types";
import type { BridgeClient } from "../bridge-client";

export const executeFormActionsInputShape = {
	actions: z.array(rpaActionSchema),
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
