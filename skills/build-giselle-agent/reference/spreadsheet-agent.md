# Building a Spreadsheet Agent

In this tutorial you'll build a spreadsheet app where an AI agent can **read, reason about, and fill cells** in real time — all through natural language.

> **Prerequisites:** Make sure you've completed the Getting Started guide — you should have packages installed and your API key set up.

---

## What we're building

The final app has two panels side by side:

- **Left — Spreadsheet grid:** A 10×6 table of editable `<input>` elements, each tagged with a `data-browser-tool-id` so the agent can see and fill them.
- **Right — Chat panel:** A conversational interface powered by `useChat`. The user types a prompt, the agent streams a response, and browser tool calls fill the spreadsheet in real time.

---

## 1. Agent definition (`lib/agent.ts`)

The agent prompt describes the exact UI the agent will interact with and gives it a clear workflow:

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

---

## 2. Spreadsheet grid with `data-browser-tool-id`

Every cell the agent should interact with gets a `data-browser-tool-id` attribute. When the agent calls `getFormSnapshot`, it receives a list of all elements with this attribute — their IDs, types, and current values.

### The `data-browser-tool-id` naming convention

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

### Grid component example

```tsx
function SpreadsheetGrid({ rows = 10, columns = 6 }) {
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
                  onChange={(e) =>
                    setCells((c) => ({ ...c, [headerId]: e.target.value }))
                  }
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
                onChange={(e) =>
                  setCells((c) => ({
                    ...c,
                    [`row-header-${rowIndex}`]: e.target.value,
                  }))
                }
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
                    onChange={(e) =>
                      setCells((c) => ({ ...c, [cellId]: e.target.value }))
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

---

## 3. Chat panel with browser tool loop

The flow:

1. **User sends a message** → hits the `/chat` route → the agent starts streaming.
2. **Agent calls `getFormSnapshot`** → the browser tool handler scans all `data-browser-tool-id` elements, collects their IDs, types, and values, and sends the snapshot back.
3. **Agent calls `executeFormActions`** → the handler executes fill/click/select actions against the DOM.
4. **`sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`** ensures the conversation continues automatically after tool results are sent back.

This loop repeats until the agent is done: snapshot → fill → snapshot again to verify → respond.

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const browserTool = useBrowserToolHandler();

  const { status, messages, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({ api: "/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    ...browserTool,
  });

  browserTool.connect(addToolOutput);

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <main>
      {/* Left panel: spreadsheet grid */}
      <SpreadsheetGrid rows={10} columns={6} />

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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || isBusy) return;
            sendMessage({ text: input.trim() });
            setInput("");
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
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

---

## Example prompts to try

- **"Compare Python, JavaScript, and Rust. Include type system, package manager, primary use case, and learning curve."**
- **"Compare the GitHub repos for next.js, react, and svelte. Include commit count, PRs, contributors, and recent activity."**
- **"Compare zod, yup, and joi over the last 12 months. Put monthly downloads and a short note about their typical use cases into the spreadsheet."**
