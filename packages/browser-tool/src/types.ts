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

export type ExecutionReport = {
	applied: number;
	skipped: number;
	warnings: string[];
};

export type RpaStatus =
	| "idle"
	| "snapshotting"
	| "planning"
	| "ready"
	| "applying"
	| "error";

export type BridgeErrorCode =
	| "UNAUTHORIZED"
	| "NO_BROWSER"
	| "TIMEOUT"
	| "INVALID_RESPONSE"
	| "NOT_FOUND"
	| "INTERNAL";

export const fieldKindSchema = z.enum([
	"text",
	"textarea",
	"select",
	"checkbox",
	"radio",
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
	options: z.array(z.string()).optional(),
});

export const fillActionSchema = z.object({
	action: z.literal("fill"),
	fieldId: z.string().min(1),
	value: z.string(),
});

export const clickActionSchema = z.object({
	action: z.literal("click"),
	fieldId: z.string().min(1),
});

export const selectActionSchema = z.object({
	action: z.literal("select"),
	fieldId: z.string().min(1),
	value: z.string(),
});

export const rpaActionSchema = z.discriminatedUnion("action", [
	fillActionSchema,
	clickActionSchema,
	selectActionSchema,
]);

export const executionReportSchema = z.object({
	applied: z.number().int().nonnegative(),
	skipped: z.number().int().nonnegative(),
	warnings: z.array(z.string()),
});

export const snapshotRequestSchema = z.object({
	type: z.literal("snapshot_request"),
	requestId: z.string().min(1),
	instruction: z.string().min(1),
	document: z.string().optional(),
});

export const executeRequestSchema = z.object({
	type: z.literal("execute_request"),
	requestId: z.string().min(1),
	actions: z.array(rpaActionSchema),
	fields: z.array(snapshotFieldSchema),
});

export const bridgeRequestSchema = z.discriminatedUnion("type", [
	snapshotRequestSchema,
	executeRequestSchema,
]);

export const snapshotResponseSchema = z.object({
	type: z.literal("snapshot_response"),
	requestId: z.string().min(1),
	fields: z.array(snapshotFieldSchema),
});

export const executeResponseSchema = z.object({
	type: z.literal("execute_response"),
	requestId: z.string().min(1),
	report: executionReportSchema,
});

export const errorResponseSchema = z.object({
	type: z.literal("error_response"),
	requestId: z.string().min(1),
	message: z.string().min(1),
});

export const bridgeResponseSchema = z.discriminatedUnion("type", [
	snapshotResponseSchema,
	executeResponseSchema,
	errorResponseSchema,
]);

export const dispatchSuccessSchema = z.object({
	ok: z.literal(true),
	response: bridgeResponseSchema,
});

export const dispatchErrorSchema = z.object({
	ok: z.literal(false),
	errorCode: z.union([
		z.literal("UNAUTHORIZED"),
		z.literal("NO_BROWSER"),
		z.literal("TIMEOUT"),
		z.literal("INVALID_RESPONSE"),
		z.literal("NOT_FOUND"),
		z.literal("INTERNAL"),
	]),
	message: z.string(),
});

export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>;
