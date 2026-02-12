import { Output, generateText } from "ai";
import { z } from "zod";

export type FieldKind = "text" | "textarea" | "select" | "checkbox" | "radio";

export type SnapshotField = {
  fieldId: string;
  selector: string;
  kind: FieldKind;
  label: string;
  name?: string;
  required: boolean;
  placeholder?: string;
  currentValue: string | boolean;
  options?: string[];
};

export type FillAction = {
  action: "fill";
  fieldId: string;
  value: string;
};

export type ClickAction = {
  action: "click";
  fieldId: string;
};

export type SelectAction = {
  action: "select";
  fieldId: string;
  value: string;
};

export type RpaAction = FillAction | ClickAction | SelectAction;

export const fieldKindSchema = z.enum([
  "text",
  "textarea",
  "select",
  "checkbox",
  "radio"
]);

export const snapshotFieldSchema = z.object({
  fieldId: z.string().min(1),
  selector: z.string().min(1),
  kind: fieldKindSchema,
  label: z.string().min(1),
  name: z.string().optional(),
  required: z.boolean(),
  placeholder: z.string().optional(),
  currentValue: z.union([z.string(), z.boolean()]),
  options: z.array(z.string()).optional()
});

export const planActionsInputSchema = z.object({
  instruction: z.string().min(1),
  document: z.string().optional(),
  fields: z.array(snapshotFieldSchema).min(1)
});

const actionSchema = z.object({
  action: z.enum(["fill", "click", "select"]),
  fieldId: z.string().min(1),
  value: z.string()
});

const modelOutputSchema = z.object({
  actions: z.array(actionSchema),
  warnings: z.array(z.string())
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

export type PlanActionsInput = {
  instruction: string;
  document?: string;
  fields: SnapshotField[];
};

export type PlanActionsResult = {
  actions: RpaAction[];
  warnings: string[];
};

export async function planActions(input: PlanActionsInput): Promise<PlanActionsResult> {
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
      options: field.options ?? []
    }))
  };

  const result = await generateText({
    model: "openai/gpt-4o-mini",
    system: systemPrompt,
    prompt: JSON.stringify(promptInput, null, 2),
    output: Output.object({ schema: modelOutputSchema })
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
      warnings.push(`Action dropped due to missing value: ${action.action} ${action.fieldId}`);
      continue;
    }

    if (action.action === "fill") {
      actions.push({
        action: "fill",
        fieldId: action.fieldId,
        value: action.value
      });
      continue;
    }

    actions.push({
      action: "select",
      fieldId: action.fieldId,
      value: action.value
    });
  }

  return { actions, warnings };
}
