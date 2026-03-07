import { createBuildHandler } from "@giselles-ai/agent-builder/next-server";
import {
  MissingServerConfigError,
  verifyApiToken,
} from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createBuildHandler({
  verifyToken: async (token) => verifyApiToken(token),
  baseSnapshotId: process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID,
});

function internalErrorResponse(message: string): Response {
  return Response.json(
    {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message,
    },
    { status: 500 },
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handler(request);
  } catch (error) {
    if (error instanceof MissingServerConfigError) {
      return internalErrorResponse(error.message);
    }

    const message =
      error instanceof Error ? error.message : "Failed to process build request.";
    console.error("POST /agent-api/build failed", error);
    return internalErrorResponse(message);
  }
}
