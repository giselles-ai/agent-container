import { z } from "zod";
import { resolveBridgeResponse, toBridgeError } from "@/lib/gemini-rpa/bridge-broker";
import { bridgeResponseSchema } from "@/lib/gemini-rpa/bridge-types";

const respondSchema = z.object({
  sessionId: z.string().min(1),
  token: z.string().min(1),
  response: bridgeResponseSchema
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = respondSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        errorCode: "INVALID_RESPONSE",
        message: "Invalid bridge response payload.",
        error: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    await resolveBridgeResponse(parsed.data);
    return Response.json({ ok: true });
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
