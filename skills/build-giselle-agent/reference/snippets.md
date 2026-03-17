# Canonical Snippets

Use these as the default patterns unless the repo context requires a different shape.

## Agent definition

```ts
import { defineAgent } from "@giselles-ai/agent";

export const agent = defineAgent({
  agentType: "codex",
  agentMd: `
You are a helpful workspace agent.

- Understand the user's request.
- Work against the files available in the sandbox.
- Write user-facing outputs to ./artifacts/.
  `,
});
```

## Next.js plugin

```ts
import { withGiselleAgent } from "@giselles-ai/agent/next";
import type { NextConfig } from "next";
import { agent } from "./lib/agent";

const nextConfig: NextConfig = {};

export default withGiselleAgent(nextConfig, agent);
```

## Streaming route

```ts
import { giselle } from "@giselles-ai/giselle-provider";
import {
  consumeStream,
  convertToModelMessages,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { agent } from "../../lib/agent";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const sessionId = body.id ?? crypto.randomUUID();

  const messages = await validateUIMessages<UIMessage>({
    messages: body.messages,
  });

  const result = streamText({
    model: giselle({ agent }),
    messages: await convertToModelMessages(messages),
    providerOptions: {
      giselle: { sessionId },
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
```

## Browser-tool route variant

```ts
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
    model: giselle({ agent }),
    messages: await convertToModelMessages(messages),
    tools: browserTools,
    providerOptions: {
      giselle: { sessionId },
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
```

## Browser-tool client pattern

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";

export default function Home() {
  const browserTool = useBrowserToolHandler();

  const { messages, status, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({ api: "/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    ...browserTool,
  });

  browserTool.connect(addToolOutput);

  return null;
}
```

## Artifact extraction from streamed messages

Use this pattern for `workspace-report` style apps. It reads `artifact` tool results
from `useChat()` messages and uses provider-emitted `download_url` when available.

```ts
type ArtifactPart = {
  type: "dynamic-tool" | "tool-result";
  toolName: string;
  output?: { path?: string; label?: string; download_url?: string };
  result?: { path?: string; label?: string; download_url?: string };
};

function isArtifactPart(part: unknown): part is ArtifactPart {
  return (
    !!part &&
    typeof part === "object" &&
    "toolName" in part &&
    (part as { toolName?: string }).toolName === "artifact"
  );
}

function getArtifactsFromMessages(
  messages: Array<{ id: string; parts?: readonly unknown[] }>,
) {
  return messages.flatMap((message) =>
    (message.parts ?? [])
      .filter(isArtifactPart)
      .map((part) => {
        const payload = "output" in part ? part.output : part.result;
        return {
          messageId: message.id,
          path: payload?.path ?? "",
          label: payload?.label ?? payload?.path ?? "artifact",
          downloadUrl: payload?.download_url,
        };
      })
      .filter((artifact) => artifact.path.length > 0),
  );
}
```

## Artifact download UI

After extracting artifacts from `useChat()` messages, render download links directly
from each artifact's `downloadUrl`.

```tsx
const artifacts = getArtifactsFromMessages(messages);

export function ArtifactList() {
  if (artifacts.length === 0) {
    return null;
  }

  return (
    <div>
      <h2>Discovered artifacts</h2>
      <ul>
        {artifacts.map((artifact) => {
          const fileName = artifact.path.split("/").at(-1) ?? artifact.path;

          return (
            <li key={`${artifact.messageId}:${artifact.path}`}>
              <span>{artifact.label}</span>
              {artifact.downloadUrl ? (
                <a href={artifact.downloadUrl}>Download {fileName}</a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

## Notes

- Add browser-tool code only when the app needs DOM interaction.
- Put user-facing outputs in `./artifacts/`.
- Describe the page structure clearly in `agentMd` when browser tools are used.
- For `workspace-report`, prefer runtime artifact events over parallel artifact metadata APIs.
