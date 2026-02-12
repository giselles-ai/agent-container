import {
  BRIDGE_SSE_KEEPALIVE_INTERVAL_MS,
  assertBridgeSession,
  bridgeRequestChannel,
  createBridgeSubscriber,
  markBridgeBrowserConnected,
  touchBridgeBrowserConnected,
  toBridgeError
} from "@/lib/gemini-rpa/bridge-broker";

export const runtime = "nodejs";
const encoder = new TextEncoder();

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
    await assertBridgeSession(sessionId, token);
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

  const requestChannel = bridgeRequestChannel(sessionId);
  let cleanup: (() => Promise<void>) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const subscriber = createBridgeSubscriber();
      let keepaliveId: ReturnType<typeof setInterval> | null = null;
      let closed = false;
      let nextEventId = 0;

      const sendSseData = (payload: unknown): void => {
        nextEventId += 1;
        controller.enqueue(
          encoder.encode(`id: ${nextEventId}\ndata: ${JSON.stringify(payload)}\n\n`)
        );
      };

      const sendSseRawJson = (rawJson: string): void => {
        nextEventId += 1;
        controller.enqueue(encoder.encode(`id: ${nextEventId}\ndata: ${rawJson}\n\n`));
      };

      const sendSseComment = (comment: string): void => {
        controller.enqueue(encoder.encode(`: ${comment}\n\n`));
      };

      const closeController = () => {
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      };

      const onAbort = () => {
        void cleanup?.();
        closeController();
      };

      cleanup = async () => {
        if (closed) {
          return;
        }

        closed = true;
        request.signal.removeEventListener("abort", onAbort);

        if (keepaliveId) {
          clearInterval(keepaliveId);
        }

        await subscriber.unsubscribe(requestChannel).catch(() => undefined);
        await subscriber.quit().catch(() => {
          subscriber.disconnect();
        });
      };

      request.signal.addEventListener("abort", onAbort);

      subscriber.on("message", (channel, message) => {
        if (closed || channel !== requestChannel) {
          return;
        }

        try {
          JSON.parse(message);
        } catch {
          return;
        }

        try {
          sendSseRawJson(message);
        } catch {
          void cleanup?.();
          closeController();
        }
      });

      subscriber.on("error", (error) => {
        if (closed) {
          return;
        }

        controller.error(error);
        void cleanup?.();
      });

      void (async () => {
        try {
          await subscriber.subscribe(requestChannel);
          await markBridgeBrowserConnected(sessionId, token);

          sendSseData({
            type: "ready",
            sessionId
          });

          keepaliveId = setInterval(() => {
            void touchBridgeBrowserConnected(sessionId).catch(() => undefined);

            try {
              sendSseComment("keepalive");
            } catch {
              void cleanup?.();
              closeController();
            }
          }, BRIDGE_SSE_KEEPALIVE_INTERVAL_MS);
        } catch (error) {
          if (closed) {
            return;
          }

          controller.error(error);
          await cleanup?.();
        }
      })();
    },
    cancel() {
      void cleanup?.();
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
