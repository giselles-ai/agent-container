import { pathToFileURL } from "node:url";
import type { RpaAction, SnapshotField } from "@giselles-ai/browser-tool";
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

type PlannerModule = {
	planActions: (input: {
		instruction: string;
		document?: string;
		fields: SnapshotField[];
	}) => Promise<PlannedActions>;
};

const PLANNER_RUNTIME_DIST_PATH =
	"/vercel/sandbox/packages/browser-tool/dist/planner/index.js";

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

async function loadPlannerModule(): Promise<PlannerModule> {
	return (await import(
		pathToFileURL(PLANNER_RUNTIME_DIST_PATH).href
	)) as PlannerModule;
}

export async function runFillForm(
	input: FillFormInput,
	bridgeClient: BridgeClient,
): Promise<FillFormOutput> {
	const parsed = fillFormInputSchema.parse(input);

	let fields: SnapshotField[];
	try {
		fields = await bridgeClient.requestSnapshot({
			instruction: parsed.instruction,
			document: parsed.document,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`[fillForm:snapshot] ${message}`);
	}

	let planned: PlannedActions;

	if (isMockPlannerEnabled()) {
		planned = buildMockPlan({
			instruction: parsed.instruction,
			fields,
		});
	} else {
		try {
			const { planActions } = await loadPlannerModule();
			planned = await planActions({
				instruction: parsed.instruction,
				document: parsed.document,
				fields,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[fillForm:planner] ${message}`);
		}
	}

	let report;
	try {
		report = await bridgeClient.requestExecute({
			actions: planned.actions,
			fields,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`[fillForm:execute] ${message}`);
	}

	return {
		applied: report.applied,
		skipped: report.skipped,
		warnings: [...planned.warnings, ...report.warnings],
	};
}
