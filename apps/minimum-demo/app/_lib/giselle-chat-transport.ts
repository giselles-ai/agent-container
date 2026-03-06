import { buildGiselleChatRequestBody } from "@giselles-ai/giselle-provider";
import { DefaultChatTransport, type UIMessage } from "ai";

export function createGiselleChatTransport<
  UI_CHAT_MESSAGE extends UIMessage,
>(input: {
  api: string;
  body?: Record<string, unknown>;
}): DefaultChatTransport<UI_CHAT_MESSAGE> {
  return new DefaultChatTransport<UI_CHAT_MESSAGE>({
    api: input.api,
    body: input.body,
    prepareSendMessagesRequest: ({
      body,
      id,
      messageId,
      messages,
      trigger,
    }) => ({
      body: buildGiselleChatRequestBody({
        id,
        messages,
        trigger,
        messageId,
        body,
      }),
    }),
  });
}
