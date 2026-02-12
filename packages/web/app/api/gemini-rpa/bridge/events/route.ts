import {
  assertBridgeSession,
  attachBridgeBrowserStream,
  detachBridgeBrowserStream,
  toBridgeError
} from "@/lib/gemini-rpa/bridge-broker";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const token = url.searchParams.get("token") ?? "";

  if (!sessionId || !token) {
    return Response.json(
      {
        errorCode: "UNAUTHORIZED",
        message: "sessionId and token are required."
      },
      { status: 401 }
    );
  }

  try {
    assertBridgeSession(sessionId, token);
  } catch (error) {
    const bridgeError = toBridgeError(error);
    return Response.json(
      {
        errorCode: bridgeError.code,
        message: bridgeError.message
      },
      { status: bridgeError.status }
    );
  }

  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;

      try {
        attachBridgeBrowserStream(sessionId, token, controller);
      } catch (error) {
        controller.error(error);
        return;
      }

      request.signal.addEventListener("abort", () => {
        detachBridgeBrowserStream(sessionId, controller);
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      });
    },
    cancel() {
      detachBridgeBrowserStream(sessionId, streamController ?? undefined);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
