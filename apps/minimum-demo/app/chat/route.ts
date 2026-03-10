import { type BrowserTools, browserTools } from "@giselles-ai/browser-tool";
import { giselle } from "@giselles-ai/giselle-provider";
import {
  consumeStream,
  convertToModelMessages,
  type InferUITools,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { agent } from "../../lib/agent";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const sessionId = body.id ?? crypto.randomUUID();

  const messages = await validateUIMessages<
    UIMessage<never, never, InferUITools<BrowserTools>>
  >({
    messages: body.messages,
    tools: browserTools,
  });

  const result = streamText({
    model: giselle({
      agent,
      snapshot: {
        onCreated: (snapshotId) => {
          console.log(`[snapshot] new snapshot created: ${snapshotId}`);
        },
      },
    }),
    messages: await convertToModelMessages(messages),
    tools: browserTools,
    providerOptions: {
      giselle: {
        sessionId,
      },
    },
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "x-giselle-session-id": sessionId,
    },
    consumeSseStream: consumeStream,
  });
}
