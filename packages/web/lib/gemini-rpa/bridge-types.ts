import type { ExecutionReport, RpaAction, SnapshotField } from "@giselles/rpa-sdk";
import { snapshotFieldSchema } from "@giselles/rpa-planner";
import { z } from "zod";

const fillActionSchema = z.object({
  action: z.literal("fill"),
  fieldId: z.string().min(1),
  value: z.string()
});

const clickActionSchema = z.object({
  action: z.literal("click"),
  fieldId: z.string().min(1)
});

const selectActionSchema = z.object({
  action: z.literal("select"),
  fieldId: z.string().min(1),
  value: z.string()
});

const rpaActionSchema = z.discriminatedUnion("action", [
  fillActionSchema,
  clickActionSchema,
  selectActionSchema
]);

const executionReportSchema = z.object({
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  warnings: z.array(z.string())
});

export const snapshotRequestSchema = z.object({
  type: z.literal("snapshot_request"),
  requestId: z.string().min(1),
  instruction: z.string().min(1),
  document: z.string().optional()
});

export const executeRequestSchema = z.object({
  type: z.literal("execute_request"),
  requestId: z.string().min(1),
  actions: z.array(rpaActionSchema),
  fields: z.array(snapshotFieldSchema)
});

export const bridgeRequestSchema = z.discriminatedUnion("type", [
  snapshotRequestSchema,
  executeRequestSchema
]);

export const snapshotResponseSchema = z.object({
  type: z.literal("snapshot_response"),
  requestId: z.string().min(1),
  fields: z.array(snapshotFieldSchema)
});

export const executeResponseSchema = z.object({
  type: z.literal("execute_response"),
  requestId: z.string().min(1),
  report: executionReportSchema
});

export const errorResponseSchema = z.object({
  type: z.literal("error_response"),
  requestId: z.string().min(1),
  message: z.string().min(1)
});

export const bridgeResponseSchema = z.discriminatedUnion("type", [
  snapshotResponseSchema,
  executeResponseSchema,
  errorResponseSchema
]);

export type BridgeRequest =
  | {
      type: "snapshot_request";
      requestId: string;
      instruction: string;
      document?: string;
    }
  | {
      type: "execute_request";
      requestId: string;
      actions: RpaAction[];
      fields: SnapshotField[];
    };

export type BridgeResponse =
  | {
      type: "snapshot_response";
      requestId: string;
      fields: SnapshotField[];
    }
  | {
      type: "execute_response";
      requestId: string;
      report: ExecutionReport;
    }
  | {
      type: "error_response";
      requestId: string;
      message: string;
    };

export type BridgeErrorCode =
  | "UNAUTHORIZED"
  | "NO_BROWSER"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "NOT_FOUND"
  | "INTERNAL";
