# Building a Spreadsheet Agent

In this tutorial you'll build a spreadsheet app where an AI agent can **read, reason about, and fill cells** in real time — all through natural language. Ask it to compare programming languages, look up npm download stats, or research GitHub repos, and watch it populate the grid right in front of you.

This is a great way to see browser tools in action: the agent snapshots your page, finds the inputs, and fills them one by one.

> **Prerequisites:** Make sure you've completed the [Getting Started](./getting-started.md) guide — you should have packages installed and your API key set up.

---

## What we're building

The final app has two panels side by side:

- **Left — Spreadsheet grid:** A 10×6 table of editable `<input>` elements, each tagged with a `data-browser-tool-id` so the agent can see and fill them.
- **Right — Chat panel:** A conversational interface powered by `useChat`. The user types a prompt, the agent streams a response, and browser tool calls fill the spreadsheet in real time.

Let's build it step by step.

---

## 1. Define the agent

The agent prompt is where the magic starts. You're not just saying "be helpful" — you're describing the **exact UI the agent will interact with** and giving it a clear workflow.

Create `lib/agent.ts`:

```ts
import { defineAgent } from "@giselles-ai/agent";

const agentMd = `
You are a helpful assistant embedded in a spreadsheet application. The user is chatting with you from a chat panel displayed to the right of a spreadsheet grid.

## Page Structure
- The page has two main areas: a spreadsheet grid on the left and a chat panel (where the user talks to you) on the right.
- The spreadsheet has a header row for column names and data rows below it.
- You can inspect the current state of the spreadsheet by calling the getFormSnapshot tool.
- You can fill or update cells by calling the executeFormActions tool.

## How to Work
1. Understand what the user wants to know or compare from their message.
2. If their intent is unclear or there are multiple possible interpretations, ask clarifying questions before proceeding.
3. Once the direction is clear, think about how to best represent the information in a tabular format (what should be columns, what should be rows).
4. Research the topic, look up data, and run analysis code if needed to produce accurate results.
5. Once the data is ready, call getFormSnapshot to see the current form fields, then call executeFormActions to fill the spreadsheet.

## Important
- Keep column headers short and clear.
- Always fill the spreadsheet instead of only describing what you would do.
`;

export const agent = defineAgent({
  agentType: "gemini",
  agentMd,
});
```

### Why this prompt matters

The agent runs inside a cloud sandbox — it has no idea what your UI looks like unless you tell it. The `agentMd` bridges that gap:

- **Page Structure** tells the agent what elements exist and what tool IDs to expect.
- **How to Work** gives it a step-by-step playbook: understand → plan → snapshot → fill.
- **Important** nudges it toward action ("fill the spreadsheet") rather than just describing what it would do.

Think of this as an `AGENTS.md` for a human contractor who can only interact with your page through tools.

---

## 2. Configure Next.js

Update `next.config.ts` to wrap your config with `withGiselleAgent`:

```ts
import { withGiselleAgent } from "@giselles-ai/agent/next";
import type { NextConfig } from "next";
import { agent } from "./lib/agent";

const nextConfig: NextConfig = {};

export default withGiselleAgent(nextConfig, agent);
```

When you run `next dev`, the plugin will authenticate with the Cloud API, build a sandbox snapshot containing your `agentMd`, and inject the snapshot ID into `process.env` — all automatically.

---

## 3. Create the chat API route

Create `app/chat/route.ts` — a standard Next.js Route Handler that streams agent responses:

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
    headers: { "x-giselle-session-id": sessionId },
    consumeSseStream: consumeStream,
  });
}
```

A few things to note:

- **`browserTools`** registers two tools the agent can call: `getFormSnapshot` (read the page) and `executeFormActions` (click, fill, select elements). These are passed both to `streamText` (so the model knows about them) and to `validateUIMessages` (so tool results from the client are validated).
- **`sessionId`** ties a conversation to a persistent sandbox session. The agent remembers context across turns.
- **`consumeSseStream`** is a workaround that ensures the server-sent event stream is fully consumed even when the client disconnects.

---

## 4. Build the spreadsheet grid

Now for the UI. The key idea: **every cell the agent should be able to interact with gets a `data-browser-tool-id` attribute.** When the agent calls `getFormSnapshot`, it receives a list of all elements with this attribute — their IDs, types, and current values.

Here's the `SpreadsheetGrid` component. Add it to `app/page.tsx`:

```tsx
function getColumnLabel(index: number): string {
  let label = "";
  let value = index;
  while (value >= 0) {
    label = String.fromCharCode((value % 26) + 65) + label;
    value = Math.floor(value / 26) - 1;
  }
  return label;
}

function SpreadsheetGrid({
  rows = 10,
  columns = 6,
  isBusy = false,
}: {
  rows?: number;
  columns?: number;
  isBusy?: boolean;
}) {
  const [cells, setCells] = useState<Record<string, string>>({});

  return (
    <table>
      <thead>
        <tr>
          <th>Row</th>
          {Array.from({ length: columns }).map((_, columnIndex) => {
            const headerId = `header-${columnIndex}`;
            return (
              <th key={headerId}>
                <input
                  type="text"
                  data-browser-tool-id={headerId}
                  value={cells[headerId] ?? ""}
                  onChange={(event) =>
                    setCells((current) => ({
                      ...current,
                      [headerId]: event.target.value,
                    }))
                  }
                  placeholder={getColumnLabel(columnIndex)}
                />
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <tr key={`row-${rowIndex}`}>
            <td>
              <input
                type="text"
                data-browser-tool-id={`row-header-${rowIndex}`}
                value={cells[`row-header-${rowIndex}`] ?? ""}
                onChange={(event) =>
                  setCells((current) => ({
                    ...current,
                    [`row-header-${rowIndex}`]: event.target.value,
                  }))
                }
                placeholder={`${rowIndex + 1}`}
              />
            </td>
            {Array.from({ length: columns }).map((_, columnIndex) => {
              const cellId = `cell-${rowIndex}-${columnIndex}`;
              return (
                <td key={cellId}>
                  <input
                    type="text"
                    data-browser-tool-id={cellId}
                    value={cells[cellId] ?? ""}
                    onChange={(event) =>
                      setCells((current) => ({
                        ...current,
                        [cellId]: event.target.value,
                      }))
                    }
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### The `data-browser-tool-id` naming convention

The IDs follow a predictable pattern:

| Element | ID pattern | Example |
| --- | --- | --- |
| Column header | `header-{columnIndex}` | `header-0`, `header-1` |
| Row header | `row-header-{rowIndex}` | `row-header-0`, `row-header-1` |
| Data cell | `cell-{rowIndex}-{columnIndex}` | `cell-0-0`, `cell-2-3` |

When the agent snapshots the page, it sees something like:

```
input#header-0 (text) value=""
input#header-1 (text) value=""
input#cell-0-0 (text) value=""
...
```

It then calls `executeFormActions` with instructions like `fill header-0 "Language"`, `fill cell-0-0 "Python"`, etc.

---

## 5. Wire up the chat panel

The chat panel connects `useChat` from Vercel AI SDK with the browser tool handler. Here's the `Home` component that ties everything together:

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { SyntheticEvent } from "react";
import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [gridKey, setGridKey] = useState(0);

  // 1. Create the browser tool handler
  const browserTool = useBrowserToolHandler();

  // 2. Set up useChat with the browser tool spread in
  const { status, messages, error, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({ api: "/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    ...browserTool,
  });

  // 3. Connect the tool output bridge
  browserTool.connect(addToolOutput);

  const isBusy = status === "submitted" || status === "streaming";

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;

    await sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <main>
      {/* Left panel: spreadsheet grid */}
      <SpreadsheetGrid key={gridKey} rows={10} columns={6} isBusy={isBusy} />

      {/* Right panel: chat */}
      <div>
        {messages.map((message) => (
          <div key={message.id}>
            <p>{message.role}</p>
            {message.parts.map((part, index) => {
              if (part.type === "text") {
                return <p key={`${message.id}-text-${index}`}>{part.text}</p>;
              }
              if (isToolUIPart(part)) {
                return (
                  <div key={`${message.id}-${part.toolCallId}`}>
                    {part.type.replace(/^tool-/, "")}: {part.state}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}

        {error && <div>{error.message}</div>}

        <form onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask the agent to fill the spreadsheet..."
          />
          <button type="submit" disabled={!input.trim() || isBusy}>
            {isBusy ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </main>
  );
}
```

### How the browser tool loop works

The flow is worth understanding — it's the core of how the agent interacts with your page:

1. **User sends a message** → hits the `/chat` route → the agent starts streaming.
2. **Agent calls `getFormSnapshot`** → the browser tool handler on the client scans all `data-browser-tool-id` elements, collects their IDs, types, and values, and sends the snapshot back as a tool result.
3. **Agent calls `executeFormActions`** → the handler receives a list of actions (fill, click, select) and executes them against the DOM, updating React state via the `onChange` handlers.
4. **`sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`** ensures that after tool results are sent back, the conversation automatically continues — the agent sees the results and can issue more tool calls or respond with text.

This loop repeats until the agent is done: snapshot → fill → snapshot again to verify → respond.

### Rendering tool call status

The `isToolUIPart` check lets you show users what the agent is doing:

```tsx
if (isToolUIPart(part)) {
  return (
    <div key={`${message.id}-${part.toolCallId}`}>
      {part.type.replace(/^tool-/, "")}: {part.state}
    </div>
  );
}
```

This renders things like `invocation: getFormSnapshot — result` or `invocation: executeFormActions — result`, giving users visibility into the agent's actions.

---

## 6. Add the shimmer animation (optional)

A small touch that makes a big difference — show a shimmer over the grid while the agent is working. Add this keyframe to `globals.css`:

```css
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
```

Then overlay a shimmer `<div>` on the grid when `isBusy` is true. See the [full source](../apps/minimum-demo/app/page.tsx) for the styled version.

---

## Try it out

Run the dev server:

```bash
pnpm dev
```

Try these prompts:

- **"Compare Python, JavaScript, and Rust. Include type system, package manager, primary use case, and learning curve."**
- **"Compare the GitHub repos for next.js, react, and svelte. Include commit count, PRs, contributors, and recent activity."**
- **"Compare zod, yup, and joi over the last 12 months. Put monthly downloads and a short note about their typical use cases into the spreadsheet."**

Watch the agent snapshot the grid, figure out the best column layout, and start filling cells. It's a surprisingly satisfying experience.

---

## Recap

Here's everything we added on top of a bare Next.js project:

| File | Purpose |
| --- | --- |
| `lib/agent.ts` | Agent definition — the system prompt describing the spreadsheet UI and the agent's workflow |
| `next.config.ts` | Wrapped with `withGiselleAgent` to build the sandbox snapshot at dev/build time |
| `app/chat/route.ts` | API route that streams agent responses with `streamText` and `browserTools` |
| `app/page.tsx` | Spreadsheet grid with `data-browser-tool-id` on every cell + chat panel with `useChat` and `useBrowserToolHandler` |
| `app/globals.css` | Shimmer animation keyframe |

The full styled source is in [`apps/minimum-demo`](../apps/minimum-demo).
