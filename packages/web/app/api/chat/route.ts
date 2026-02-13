import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";

const fieldKindSchema = z.enum([
  "text",
  "textarea",
  "select",
  "checkbox",
  "radio"
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
  options: z.array(z.string()).optional()
});

const requestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()).default([]),
  fields: z.array(snapshotFieldSchema).optional()
});

function buildFormContext(fields: z.infer<typeof snapshotFieldSchema>[]): string {
  if (fields.length === 0) {
    return "No visible form fields were provided in this request.";
  }

  const summarized = fields.map((field) => ({
    fieldId: field.fieldId,
    kind: field.kind,
    label: field.label,
    name: field.name ?? "",
    required: field.required,
    placeholder: field.placeholder ?? "",
    currentValue: field.currentValue,
    options: field.options ?? []
  }));

  return `Visible form snapshot:\n${JSON.stringify(summarized, null, 2)}`;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const messages = parsed.data.messages;
  const formContext = buildFormContext(parsed.data.fields ?? []);

  const result = streamText({
    model: "openai/gpt-4o-mini",
    system: [
      formContext,
      "You are an RPA assistant that helps users fill out web forms.",
      "When the user asks to fill a form, call the fillForm tool.",
      "After receiving the tool result, summarize what was done and mention warnings if any."
    ].join("\n"),
    messages: await convertToModelMessages(messages),
    tools: {
      fillForm: {
        description: "Fill form fields based on user instruction",
        inputSchema: z.object({
          instruction: z.string().describe("What to fill and how"),
          document: z
            .string()
            .optional()
            .describe("Source document to extract data from")
        })
      }
    }
  });

  return result.toUIMessageStreamResponse();
}
