import {
	type ClickAction,
	type FieldKind,
	type FillAction,
	fieldKindSchema,
	type PlanActionsInput,
	type PlanResult,
	planActionsInputSchema,
	type RpaAction,
	type SelectAction,
	type SnapshotField,
	snapshotFieldSchema,
} from "@giselles/browser-tool-sdk";
import { generateText, Output } from "ai";
import { z } from "zod";

export { fieldKindSchema, planActionsInputSchema, snapshotFieldSchema };

const actionSchema = z.object({
	action: z.enum(["fill", "click", "select"]),
	fieldId: z.string().min(1),
	value: z.string(),
});

const modelOutputSchema = z.object({
	actions: z.array(actionSchema),
	warnings: z.array(z.string()),
});

const systemPrompt = `
You are an RPA planner for a web form.
Return only JSON matching the schema.
Use only fieldId values provided in the input.
Allowed actions: fill, click, select.
The "value" field is always required.
For click actions, set value to an empty string "".
Do not invent fields.
If instruction is ambiguous, skip uncertain actions and put notes in warnings.
`.trim();

export type PlanActionsResult = {
	actions: RpaAction[];
	warnings: string[];
};

export type {
	ClickAction,
	FillAction,
	FieldKind,
	PlanActionsInput,
	PlanResult,
	RpaAction,
	SelectAction,
	SnapshotField,
};

export async function planActions(
	input: PlanActionsInput,
): Promise<PlanActionsResult> {
	const parsed = planActionsInputSchema.parse(input);
	const { instruction, document, fields } = parsed;
	const allowedFieldIds = new Set(fields.map((field) => field.fieldId));

	const promptInput = {
		instruction,
		document: document ?? "",
		fields: fields.map((field) => ({
			fieldId: field.fieldId,
			kind: field.kind,
			label: field.label,
			name: field.name,
			required: field.required,
			placeholder: field.placeholder,
			currentValue: field.currentValue,
			options: field.options ?? [],
		})),
	};

	const result = await generateText({
		model: "openai/gpt-4o-mini",
		system: systemPrompt,
		prompt: JSON.stringify(promptInput, null, 2),
		output: Output.object({ schema: modelOutputSchema }),
	});

	const warnings = [...result.output.warnings];
	const actions: RpaAction[] = [];

	for (const action of result.output.actions) {
		if (!allowedFieldIds.has(action.fieldId)) {
			warnings.push(`Unknown fieldId dropped: ${action.fieldId}`);
			continue;
		}

		if (action.action === "click") {
			actions.push({ action: "click", fieldId: action.fieldId });
			continue;
		}

		if (typeof action.value !== "string") {
			warnings.push(
				`Action dropped due to missing value: ${action.action} ${action.fieldId}`,
			);
			continue;
		}

		if (action.action === "fill") {
			actions.push({
				action: "fill",
				fieldId: action.fieldId,
				value: action.value,
			});
			continue;
		}

		actions.push({
			action: "select",
			fieldId: action.fieldId,
			value: action.value,
		});
	}

	return { actions, warnings };
}
