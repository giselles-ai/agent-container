import { createRelaySession } from "@giselles-ai/browser-tool/relay";
import {
  createCodexAgent,
  createGeminiAgent,
  runCloudChat,
  type ChatAgent,
  type CloudChatRequest,
  type CloudToolResult,
} from "@giselles-ai/agent-runtime";
import { z } from "zod";
import {
  extractBearerToken,
  getOptionalEnv,
  getRequiredEnv,
  MissingServerConfigError,
  verifyApiToken,
} from "../_lib/auth";
import { RedisCloudChatStateStore } from "../_lib/chat-state-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  type: z.literal("agent.run"),
  chat_id: z.string().min(1),
  message: z.string().min(1),
  agent_type: z.enum(["gemini", "codex"]),
  snapshot_id: z.string().min(1),
  tool_results: z
    .array(
      z.object({
        toolCallId: z.string().min(1),
        toolName: z.enum(["getFormSnapshot", "executeFormActions"]),
        output: z.unknown(),
      }),
    )
    .optional(),
});

type RunnerCloudChatRequest = CloudChatRequest & {
  snapshot_id: string;
  session_id?: string;
  sandbox_id?: string;
  relay_session_id?: string;
  relay_token?: string;
};

const store = new RedisCloudChatStateStore();

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function errorResponse(
  status: number,
  errorCode: string,
  message: string,
): Response {
  return Response.json(
    {
      ok: false,
      errorCode,
      message,
    },
    { status },
  );
}

function resolveRelayUrl(request: Request): string {
  const configuredBaseUrl = getOptionalEnv("CLOUD_CHAT_RUNNER_PUBLIC_BASE_URL");
  if (configuredBaseUrl) {
    return new URL("/agent-api/relay", `${trimTrailingSlash(configuredBaseUrl)}/`)
      .toString();
  }

  return new URL("/agent-api/relay", request.url).toString();
}

function createBrowserRelayEnv(
  relayUrl: string,
  agentType: "gemini" | "codex",
): Record<string, string> {
  const vercelProtectionBypass = getOptionalEnv("VERCEL_PROTECTION_BYPASS");
  const giselleProtectionBypass = getOptionalEnv("GISELLE_PROTECTION_BYPASS");

  return {
    BROWSER_TOOL_RELAY_URL: relayUrl,
    ...(agentType === "gemini"
      ? { GEMINI_API_KEY: getRequiredEnv("GEMINI_API_KEY") }
      : { CODEX_API_KEY: getRequiredEnv("CODEX_API_KEY") }),
    ...(vercelProtectionBypass
      ? { VERCEL_PROTECTION_BYPASS: vercelProtectionBypass }
      : {}),
    ...(giselleProtectionBypass
      ? { GISELLE_PROTECTION_BYPASS: giselleProtectionBypass }
      : {}),
  };
}

function createRuntimeAgent(input: {
  agentType: "gemini" | "codex";
  snapshotId: string;
  relayUrl: string;
}): ChatAgent<RunnerCloudChatRequest> {
  const options = {
    snapshotId: input.snapshotId,
    env: createBrowserRelayEnv(input.relayUrl, input.agentType),
    tools: {
      browser: {
        relayUrl: input.relayUrl,
      },
    },
  };

  const agent =
    input.agentType === "gemini"
      ? createGeminiAgent(options)
      : createCodexAgent(options);

  // `runCloudChat()` adds chat-level fields (`chat_id`, `tool_results`) that the
  // agent implementations ignore. The runtime path does not read `requestSchema`.
  return agent as unknown as ChatAgent<RunnerCloudChatRequest>;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return errorResponse(401, "UNAUTHORIZED", "Missing authorization token.");
    }
    if (!verifyApiToken(token)) {
      return errorResponse(401, "UNAUTHORIZED", "Invalid authorization token.");
    }

    const payload = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse(400, "INVALID_REQUEST", "Invalid run request.");
    }

    const relayUrl = resolveRelayUrl(request);
    const agent = createRuntimeAgent({
      agentType: parsed.data.agent_type,
      snapshotId: parsed.data.snapshot_id,
      relayUrl,
    });

    return await runCloudChat<RunnerCloudChatRequest>({
      chatId: parsed.data.chat_id,
      request: {
        message: parsed.data.message,
        chat_id: parsed.data.chat_id,
        snapshot_id: parsed.data.snapshot_id,
        tool_results: parsed.data.tool_results as CloudToolResult[] | undefined,
      },
      agent,
      signal: request.signal,
      deps: {
        store,
        relayUrl,
        createRelaySession,
      },
    });
  } catch (error) {
    if (error instanceof MissingServerConfigError) {
      return errorResponse(500, "INTERNAL_ERROR", error.message);
    }

    const message =
      error instanceof Error ? error.message : "Failed to process run request.";
    console.error("POST /agent-api/run failed", error);
    return errorResponse(500, "INTERNAL_ERROR", message);
  }
}
