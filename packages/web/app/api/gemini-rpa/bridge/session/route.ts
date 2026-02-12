import { createBridgeSession } from "@/lib/gemini-rpa/bridge-broker";

export const runtime = "nodejs";

export async function POST() {
  const session = createBridgeSession();

  return Response.json({
    sessionId: session.sessionId,
    token: session.token,
    expiresAt: session.expiresAt
  });
}
