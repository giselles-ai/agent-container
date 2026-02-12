import { z } from "zod";
import { dispatchBridgeRequest, toBridgeError } from "@/lib/gemini-rpa/bridge-broker";
import { bridgeRequestSchema } from "@/lib/gemini-rpa/bridge-types";

const dispatchSchema = z.object({
  sessionId: z.string().min(1),
  token: z.string().min(1),
  request: bridgeRequestSchema,
  timeoutMs: z.number().int().positive().max(55_000).optional()
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = dispatchSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        errorCode: "INVALID_RESPONSE",
        message: "Invalid dispatch payload.",
        error: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    const response = await dispatchBridgeRequest(parsed.data);
    return Response.json({ ok: true, response });
  } catch (error) {
    const bridgeError = toBridgeError(error);
    return Response.json(
      {
        ok: false,
        errorCode: bridgeError.code,
        message: bridgeError.message
      },
      { status: bridgeError.status }
    );
  }
}
