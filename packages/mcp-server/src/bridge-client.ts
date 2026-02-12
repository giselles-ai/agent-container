import { randomUUID } from "node:crypto";
import { z } from "zod";

export type ExecutionReport = {
  applied: number;
  skipped: number;
  warnings: string[];
};

type FieldKind = "text" | "textarea" | "select" | "checkbox" | "radio";

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

type FillAction = {
  action: "fill";
  fieldId: string;
  value: string;
};

type ClickAction = {
  action: "click";
  fieldId: string;
};

type SelectAction = {
  action: "select";
  fieldId: string;
  value: string;
};

export type RpaAction = FillAction | ClickAction | SelectAction;

const snapshotFieldSchema = z.object({
  fieldId: z.string().min(1),
  selector: z.string().min(1),
  kind: z.enum(["text", "textarea", "select", "checkbox", "radio"]),
  label: z.string().min(1),
  name: z.string().optional(),
  required: z.boolean(),
  placeholder: z.string().optional(),
  currentValue: z.union([z.string(), z.boolean()]),
  options: z.array(z.string()).optional()
});

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

const bridgeRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot_request"),
    requestId: z.string().min(1),
    instruction: z.string().min(1),
    document: z.string().optional()
  }),
  z.object({
    type: z.literal("execute_request"),
    requestId: z.string().min(1),
    actions: z.array(rpaActionSchema),
    fields: z.array(snapshotFieldSchema)
  })
]);

const bridgeResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot_response"),
    requestId: z.string().min(1),
    fields: z.array(snapshotFieldSchema)
  }),
  z.object({
    type: z.literal("execute_response"),
    requestId: z.string().min(1),
    report: executionReportSchema
  }),
  z.object({
    type: z.literal("error_response"),
    requestId: z.string().min(1),
    message: z.string().min(1)
  })
]);

const dispatchSuccessSchema = z.object({
  ok: z.literal(true),
  response: bridgeResponseSchema
});

const dispatchErrorSchema = z.object({
  ok: z.literal(false),
  errorCode: z.string(),
  message: z.string()
});

type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
type BridgeResponse = z.infer<typeof bridgeResponseSchema>;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function trimTrailingSlash(input: string): string {
  return input.replace(/\/+$/, "");
}

export class BridgeClient {
  private readonly baseUrl: string;
  private readonly sessionId: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly protectionBypass: string | null;

  constructor(input: {
    baseUrl: string;
    sessionId: string;
    token: string;
    timeoutMs?: number;
    protectionBypass?: string;
  }) {
    this.baseUrl = trimTrailingSlash(input.baseUrl);
    this.sessionId = input.sessionId;
    this.token = input.token;
    this.timeoutMs = input.timeoutMs ?? 20_000;
    this.protectionBypass = input.protectionBypass?.trim() || null;
  }

  async requestSnapshot(input: {
    instruction: string;
    document?: string;
  }): Promise<SnapshotField[]> {
    const response = await this.dispatch({
      type: "snapshot_request",
      requestId: randomUUID(),
      instruction: input.instruction,
      document: input.document
    });

    if (response.type !== "snapshot_response") {
      throw new Error(`Unexpected bridge response type: ${response.type}`);
    }

    return response.fields;
  }

  async requestExecute(input: {
    actions: RpaAction[];
    fields: SnapshotField[];
  }): Promise<ExecutionReport> {
    const response = await this.dispatch({
      type: "execute_request",
      requestId: randomUUID(),
      actions: input.actions,
      fields: input.fields
    });

    if (response.type !== "execute_response") {
      throw new Error(`Unexpected bridge response type: ${response.type}`);
    }

    return response.report;
  }

  private async dispatch(request: BridgeRequest): Promise<BridgeResponse> {
    const payload = bridgeRequestSchema.parse(request);
    let response: Response;

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };
      if (this.protectionBypass) {
        headers["x-vercel-protection-bypass"] = this.protectionBypass;
      }

      response = await fetch(`${this.baseUrl}/api/gemini-rpa/bridge/dispatch`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          sessionId: this.sessionId,
          token: this.token,
          timeoutMs: this.timeoutMs,
          request: payload
        })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        [
          "Bridge dispatch network request failed.",
          `baseUrl=${this.baseUrl}`,
          "Ensure RPA_BRIDGE_BASE_URL is reachable from the sandbox runtime.",
          `cause=${message}`
        ].join(" ")
      );
    }

    const body = await response.json().catch(() => null);

    const failure = dispatchErrorSchema.safeParse(body);
    if (failure.success) {
      throw new Error(`[${failure.data.errorCode}] ${failure.data.message}`);
    }

    const success = dispatchSuccessSchema.safeParse(body);
    if (!success.success) {
      throw new Error("Bridge dispatch returned an unexpected payload.");
    }

    if (!response.ok) {
      throw new Error(`Bridge dispatch failed with HTTP ${response.status}.`);
    }

    return success.data.response;
  }
}

export function createBridgeClientFromEnv(): BridgeClient {
  const protectionBypass = process.env.VERCEL_PROTECTION_BYPASS;
  console.error(
    `[bridge-client] VERCEL_PROTECTION_BYPASS=${protectionBypass?.trim() || "(unset)"}`
  );

  return new BridgeClient({
    baseUrl: requiredEnv("RPA_BRIDGE_BASE_URL"),
    sessionId: requiredEnv("RPA_BRIDGE_SESSION_ID"),
    token: requiredEnv("RPA_BRIDGE_TOKEN"),
    protectionBypass
  });
}
