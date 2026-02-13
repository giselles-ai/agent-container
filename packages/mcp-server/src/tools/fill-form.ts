import type { RpaAction, SnapshotField } from "@giselles/rpa-sdk";
import { z } from "zod";
import type { BridgeClient } from "../bridge-client.js";

export const fillFormInputShape = {
	instruction: z.string().min(1),
	document: z.string().optional(),
};

const fillFormInputSchema = z.object(fillFormInputShape);

export type FillFormInput = z.infer<typeof fillFormInputSchema>;

export type FillFormOutput = {
	applied: number;
	skipped: number;
	warnings: string[];
};

type PlannedActions = {
	actions: RpaAction[];
	warnings: string[];
};

function isMockPlannerEnabled(): boolean {
	const value = process.env.RPA_MCP_MOCK_PLAN?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}

function buildMockPlan(input: {
	instruction: string;
	fields: SnapshotField[];
}): PlannedActions {
	const actions: RpaAction[] = [];
	const warnings = ["Planner is running in mock mode (RPA_MCP_MOCK_PLAN=1)."];

	const firstWritableField = input.fields.find(
		(field) => field.kind === "text" || field.kind === "textarea",
	);

	if (firstWritableField) {
		actions.push({
			action: "fill",
			fieldId: firstWritableField.fieldId,
			value: input.instruction,
		});
	} else {
		warnings.push("Mock planner found no text/textarea field.");
	}

	const firstSelectField = input.fields.find(
		(field) =>
			field.kind === "select" &&
			Array.isArray(field.options) &&
			field.options.length > 0,
	);

	if (firstSelectField?.options?.[0]) {
		actions.push({
			action: "select",
			fieldId: firstSelectField.fieldId,
			value: firstSelectField.options[0],
		});
	}

	return { actions, warnings };
}

export async function runFillForm(
	input: FillFormInput,
	bridgeClient: BridgeClient,
): Promise<FillFormOutput> {
	const parsed = fillFormInputSchema.parse(input);

	const fields = await bridgeClient.requestSnapshot({
		instruction: parsed.instruction,
		document: parsed.document,
	});

	let planned: PlannedActions;

	if (isMockPlannerEnabled()) {
		planned = buildMockPlan({
			instruction: parsed.instruction,
			fields,
		});
	} else {
		const { planActions } = await import("@giselles/rpa-planner/runtime");
		planned = await planActions({
			instruction: parsed.instruction,
			document: parsed.document,
			fields,
		});
	}

	const report = await bridgeClient.requestExecute({
		actions: planned.actions,
		fields,
	});

	return {
		applied: report.applied,
		skipped: report.skipped,
		warnings: [...planned.warnings, ...report.warnings],
	};
}
