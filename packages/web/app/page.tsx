"use client";

import { execute, snapshot } from "@giselles/rpa-sdk";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage
} from "ai";
import { useMemo, useState } from "react";

type FillFormInput = {
  instruction: string;
  document?: string;
};

type FillFormOutput = {
  applied: number;
  skipped: number;
  warnings: string[];
};

type ChatMessage = UIMessage<
  unknown,
  never,
  {
    fillForm: {
      input: FillFormInput;
      output: FillFormOutput;
    };
  }
>;

type PlanResponse = {
  actions: Parameters<typeof execute>[0];
  warnings: string[];
};

type SnapshotFields = ReturnType<typeof snapshot>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parseWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function parsePlanResponse(value: unknown): PlanResponse {
  if (!isRecord(value)) {
    return { actions: [], warnings: ["Invalid planner response."] };
  }

  const actions = Array.isArray(value.actions)
    ? (value.actions as Parameters<typeof execute>[0])
    : [];

  return {
    actions,
    warnings: parseWarnings(value.warnings)
  };
}

function parseFillFormInput(value: unknown): FillFormInput | null {
  if (!isRecord(value) || typeof value.instruction !== "string") {
    return null;
  }

  return {
    instruction: value.instruction,
    document: typeof value.document === "string" ? value.document : undefined
  };
}

function captureSnapshotSafely(): SnapshotFields {
  try {
    return snapshot();
  } catch {
    return [];
  }
}

function DemoForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("memo");
  const [publish, setPublish] = useState(false);

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-2xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">AI RPA MVP</p>
      <h1 className="mt-2 text-3xl font-semibold">Form Autofill Prototype</h1>
      <p className="mt-3 text-sm text-slate-300/90">
        Use chat to request form filling. The assistant will plan and apply DOM actions automatically.
      </p>

      <form className="mt-8 space-y-5" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-medium text-slate-100">
            Title
          </label>
          <input
            id="title"
            name="title"
            data-rpa-id="title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Enter title"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <label htmlFor="body" className="mb-2 block text-sm font-medium text-slate-100">
            Body
          </label>
          <textarea
            id="body"
            name="body"
            data-rpa-id="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Enter body"
            rows={8}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <label htmlFor="category" className="mb-2 block text-sm font-medium text-slate-100">
            Category
          </label>
          <select
            id="category"
            name="category"
            data-rpa-id="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
          >
            <option value="memo">Memo</option>
            <option value="blog">Blog Post</option>
            <option value="report">Report</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            name="publish"
            data-rpa-id="publish"
            checked={publish}
            onChange={(event) => setPublish(event.target.checked)}
            className="h-4 w-4 rounded border-slate-500 bg-slate-950 text-cyan-400"
          />
          Publish immediately
        </label>
      </form>

      <div className="mt-8 rounded-xl border border-slate-700/80 bg-slate-950/70 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Current State</p>
        <pre className="mt-2 overflow-auto text-xs text-slate-200">
          {JSON.stringify({ title, body, category, publish }, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function ChatPanel() {
  const [input, setInput] = useState("");
  const [documentText, setDocumentText] = useState("");

  const { messages, sendMessage, addToolOutput, status, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages: nextMessages, body }) {
        return {
          body: {
            ...body,
            messages: nextMessages,
            fields: captureSnapshotSafely()
          }
        };
      }
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) {
        return;
      }

      if (toolCall.toolName !== "fillForm") {
        return;
      }

      const toolInput = parseFillFormInput(toolCall.input);
      if (!toolInput) {
        addToolOutput({
          tool: "fillForm",
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: "Invalid tool input."
        });
        return;
      }

      try {
        const fields = snapshot();

        const response = await fetch("/api/rpa", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            instruction: toolInput.instruction,
            document: toolInput.document ?? (documentText.trim() || undefined),
            fields
          })
        });

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          const plannerError =
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : `Planner failed with status ${response.status}`;
          throw new Error(plannerError);
        }

        const plan = parsePlanResponse(payload);
        const report = execute(plan.actions, fields);

        addToolOutput({
          tool: "fillForm",
          toolCallId: toolCall.toolCallId,
          output: {
            applied: report.applied,
            skipped: report.skipped,
            warnings: [...plan.warnings, ...report.warnings]
          }
        });
      } catch (toolError) {
        const message =
          toolError instanceof Error ? toolError.message : "Failed to execute fillForm.";

        addToolOutput({
          tool: "fillForm",
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: message
        });
      }
    }
  });

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => (
        <div key={message.id} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{message.role}</p>
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return (
                <p key={`${message.id}-text-${index}`} className="whitespace-pre-wrap text-sm text-slate-100">
                  {part.text}
                </p>
              );
            }

            if (part.type === "tool-fillForm") {
              if (part.state === "input-streaming") {
                return (
                  <p key={part.toolCallId} className="text-xs text-slate-400">
                    Preparing fill instructions...
                  </p>
                );
              }

              if (part.state === "input-available") {
                return (
                  <p key={part.toolCallId} className="text-xs text-cyan-200">
                    Planning and applying form actions...
                  </p>
                );
              }

              if (part.state === "output-error") {
                return (
                  <p key={part.toolCallId} className="text-xs text-rose-300">
                    Tool error: {part.errorText}
                  </p>
                );
              }

              if (part.state !== "output-available") {
                return null;
              }

              return (
                <div key={part.toolCallId} className="rounded-md border border-slate-700 bg-slate-950/70 p-2 text-xs text-slate-200">
                  <p>Applied: {part.output.applied}</p>
                  <p>Skipped: {part.output.skipped}</p>
                  {part.output.warnings.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-amber-200">
                      {part.output.warnings.map((warning, warningIndex) => (
                        <li key={`${part.toolCallId}-warn-${warningIndex}`}>- {warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            }

            return null;
          })}
        </div>
      )),
    [messages]
  );

  return (
    <section className="fixed bottom-4 right-4 z-50 w-[min(30rem,calc(100vw-2rem))]">
      <div className="rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.15em] text-cyan-300">RPA Chat</p>
          <p className="text-[11px] text-slate-400">status: {status}</p>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-slate-300">Document (optional)</span>
          <textarea
            rows={4}
            value={documentText}
            onChange={(event) => setDocumentText(event.target.value)}
            placeholder="Paste source document here"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
          />
        </label>

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{renderedMessages}</div>

        {error ? <p className="mt-2 text-xs text-rose-300">{error.message}</p> : null}

        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = input.trim();
            if (!trimmed) {
              return;
            }
            sendMessage({ text: trimmed });
            setInput("");
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="e.g. Fill title and body with a concise summary"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || status !== "ready"}
            className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen p-6 text-slate-100 sm:p-10">
      <div className="mb-4">
        <a
          href="/gemini-rpa"
          className="inline-flex rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
        >
          Open Gemini CLI + MCP + SSE demo
        </a>
      </div>
      <DemoForm />
      <ChatPanel />
    </main>
  );
}
