import { generateText, Output } from "ai";
import { z } from "zod";

const fieldKindSchema = z.enum([
	"text",
	"textarea",
	"select",
	"checkbox",
	"radio",
]);

const snapshotFieldSchema = z.object({
	fieldId: z.string().min(1),
	selector: z.string().min(1),
	kind: fieldKindSchema,
	label: z.string().min(1),
	name: z.string().optional(),
	required: z.boolean(),
	placeholder: z.string().optional(),
	currentValue: z.union([z.string(), z.boolean()]),
	options: z.array(z.string()).optional(),
});

const requestSchema = z.object({
	instruction: z.string().min(1),
	document: z.string().optional(),
	fields: z.array(snapshotFieldSchema).min(1),
});

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

export async function POST(request: Request) {
	const payload = await request.json().catch(() => null);
	const parsed = requestSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{
				actions: [],
				warnings: ["Invalid request payload."],
				error: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	const { instruction, document, fields } = parsed.data;
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

	try {
		const result = await generateText({
			model: "openai/gpt-4o-mini",
			system: systemPrompt,
			prompt: JSON.stringify(promptInput, null, 2),
			output: Output.object({ schema: modelOutputSchema }),
		});

		const warnings = [...result.output.warnings];
		const actions: Array<
			| { action: "fill"; fieldId: string; value: string }
			| { action: "click"; fieldId: string }
			| { action: "select"; fieldId: string; value: string }
		> = [];

		for (const action of result.output.actions) {
			if (allowedFieldIds.has(action.fieldId)) {
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
				continue;
			}
			warnings.push(`Unknown fieldId dropped: ${action.fieldId}`);
		}

		return Response.json({ actions, warnings });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown LLM error.";
		return Response.json(
			{
				actions: [],
				warnings: [`Failed to generate actions: ${message}`],
			},
			{ status: 500 },
		);
	}
}
