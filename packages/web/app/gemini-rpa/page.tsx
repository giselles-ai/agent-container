"use client";

import { execute, snapshot } from "@giselles/rpa-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BridgeSession = {
  sessionId: string;
  token: string;
  expiresAt: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ToolCard = {
  id: string;
  toolId: string;
  toolName: string;
  status?: "success" | "error";
  parameters?: unknown;
  output?: unknown;
};

type StreamEvent = {
  type?: string;
  [key: string]: unknown;
};

type BridgeStatus = "connecting" | "connected" | "disconnected" | "error";

type ChatStatus = "ready" | "streaming";

type SnapshotFields = ReturnType<typeof snapshot>;
type RpaActions = Parameters<typeof execute>[0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function extractWarnings(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.warnings)) {
    return [];
  }

  return value.warnings.filter((warning): warning is string => typeof warning === "string");
}

function extractJsonObjects(buffer: string): { objects: string[]; rest: string } {
  const objects: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let startIndex = -1;

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        objects.push(buffer.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  if (depth > 0 && startIndex >= 0) {
    return {
      objects,
      rest: buffer.slice(startIndex)
    };
  }

  return {
    objects,
    rest: ""
  };
}

function DemoForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("memo");
  const [publish, setPublish] = useState(false);

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-2xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">Gemini RPA Bridge</p>
      <h1 className="mt-2 text-3xl font-semibold">Form Autofill Prototype</h1>
      <p className="mt-3 text-sm text-slate-300/90">
        This page uses Gemini CLI + MCP + SSE bridge for browser-side DOM execution.
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

export default function GeminiRpaPage() {
  const [input, setInput] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [chatStatus, setChatStatus] = useState<ChatStatus>("ready");
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("connecting");
  const [bridgeSession, setBridgeSession] = useState<BridgeSession | null>(null);
  const [geminiSessionId, setGeminiSessionId] = useState<string | null>(null);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolCard[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stderrLogs, setStderrLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const bridgeSessionRef = useRef<BridgeSession | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const assistantContentRef = useRef("");

  const appendWarning = useCallback((nextWarnings: string[]) => {
    if (nextWarnings.length === 0) {
      return;
    }

    setWarnings((current) => {
      const merged = new Set(current);
      for (const warning of nextWarnings) {
        merged.add(warning);
      }
      return Array.from(merged);
    });
  }, []);

  const sendBridgeResponse = useCallback(
    async (responsePayload: Record<string, unknown>) => {
      const session = bridgeSessionRef.current;
      if (!session) {
        return;
      }

      await fetch("/api/gemini-rpa/bridge/respond", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          token: session.token,
          response: responsePayload
        })
      });
    },
    []
  );

  const handleBridgeEvent = useCallback(
    async (event: unknown) => {
      if (!isRecord(event) || typeof event.type !== "string") {
        return;
      }

      if (event.type === "ready") {
        return;
      }

      const requestId = asString(event.requestId);
      if (!requestId) {
        return;
      }

      try {
        if (event.type === "snapshot_request") {
          const fields = snapshot();
          await sendBridgeResponse({
            type: "snapshot_response",
            requestId,
            fields
          });
          return;
        }

        if (event.type === "execute_request") {
          const actions = Array.isArray(event.actions) ? (event.actions as RpaActions) : [];
          const fields = Array.isArray(event.fields) ? (event.fields as SnapshotFields) : [];
          const report = execute(actions, fields);

          await sendBridgeResponse({
            type: "execute_response",
            requestId,
            report
          });
          appendWarning(report.warnings);
          return;
        }

        await sendBridgeResponse({
          type: "error_response",
          requestId,
          message: `Unsupported bridge request type: ${event.type}`
        });
      } catch (bridgeError) {
        const message = bridgeError instanceof Error ? bridgeError.message : "Bridge execution failed.";
        await sendBridgeResponse({
          type: "error_response",
          requestId,
          message
        });
      }
    },
    [appendWarning, sendBridgeResponse]
  );

  useEffect(() => {
    let isActive = true;

    const initializeBridge = async () => {
      setBridgeStatus("connecting");

      try {
        const response = await fetch("/api/gemini-rpa/bridge/session", {
          method: "POST"
        });

        if (!response.ok) {
          throw new Error(`Failed to create bridge session (${response.status}).`);
        }

        const payload = (await response.json()) as BridgeSession;

        if (!isActive) {
          return;
        }

        bridgeSessionRef.current = payload;
        setBridgeSession(payload);

        const url = new URL("/api/gemini-rpa/bridge/events", window.location.origin);
        url.searchParams.set("sessionId", payload.sessionId);
        url.searchParams.set("token", payload.token);

        const source = new EventSource(url.toString());
        eventSourceRef.current = source;

        source.onopen = () => {
          if (!isActive) {
            return;
          }
          setBridgeStatus("connected");
        };

        source.onmessage = (messageEvent) => {
          if (!isActive) {
            return;
          }

          try {
            const parsed = JSON.parse(messageEvent.data) as unknown;
            void handleBridgeEvent(parsed);
          } catch {
            // Ignore malformed bridge event.
          }
        };

        source.onerror = () => {
          if (!isActive) {
            return;
          }
          setBridgeStatus("disconnected");
        };
      } catch (bridgeError) {
        if (!isActive) {
          return;
        }

        const message = bridgeError instanceof Error ? bridgeError.message : "Failed to initialize bridge.";
        setError(message);
        setBridgeStatus("error");
      }
    };

    void initializeBridge();

    return () => {
      isActive = false;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      bridgeSessionRef.current = null;
    };
  }, [handleBridgeEvent]);

  const appendAssistantDelta = useCallback((delta: string) => {
    const currentAssistantId = assistantMessageIdRef.current;

    if (!currentAssistantId) {
      const nextId = crypto.randomUUID();
      assistantMessageIdRef.current = nextId;
      assistantContentRef.current = delta;

      setMessages((current) => [
        ...current,
        {
          id: nextId,
          role: "assistant",
          content: delta
        }
      ]);
      return;
    }

    const merged = `${assistantContentRef.current}${delta}`;
    assistantContentRef.current = merged;

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== currentAssistantId) {
          return message;
        }

        return {
          ...message,
          content: merged
        };
      })
    );
  }, []);

  const appendAssistantMessage = useCallback((content: string) => {
    if (content.trim().length === 0) {
      return;
    }

    const id = crypto.randomUUID();
    assistantMessageIdRef.current = id;
    assistantContentRef.current = content;

    setMessages((current) => [
      ...current,
      {
        id,
        role: "assistant",
        content
      }
    ]);
  }, []);

  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      if (typeof event.type !== "string") {
        return;
      }

      if (event.type === "sandbox") {
        const nextSandboxId = asString(event.sandbox_id);
        if (nextSandboxId) {
          setSandboxId(nextSandboxId);
        }
        return;
      }

      if (event.type === "init") {
        const nextSessionId = asString(event.session_id);
        if (nextSessionId) {
          setGeminiSessionId(nextSessionId);
        }
        return;
      }

      if (event.type === "stderr") {
        const text = asString(event.content);
        if (text) {
          setStderrLogs((current) => [...current, text]);
        }
        return;
      }

      if (event.type === "message") {
        const role = asString(event.role);
        const content = asString(event.content) ?? "";
        const isDelta = Boolean(event.delta);

        if (role === "assistant") {
          if (isDelta) {
            appendAssistantDelta(content);
            return;
          }

          appendAssistantMessage(content);
          return;
        }

        if (role === "user" && content.trim().length > 0) {
          setMessages((current) => {
            const last = current[current.length - 1];
            if (last && last.role === "user" && last.content === content) {
              return current;
            }

            return [
              ...current,
              {
                id: crypto.randomUUID(),
                role: "user",
                content
              }
            ];
          });
        }

        return;
      }

      if (event.type === "tool_use") {
        const toolId = asString(event.tool_id) ?? crypto.randomUUID();
        const toolName = asString(event.tool_name) ?? "tool";

        setTools((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            toolId,
            toolName,
            parameters: event.parameters
          }
        ]);
        return;
      }

      if (event.type === "tool_result") {
        const toolId = asString(event.tool_id);
        if (!toolId) {
          return;
        }

        const status = asString(event.status);
        const nextStatus = status === "success" || status === "error" ? status : undefined;

        setTools((current) =>
          current.map((tool) => {
            if (tool.toolId !== toolId) {
              return tool;
            }

            return {
              ...tool,
              status: nextStatus,
              output: event.output
            };
          })
        );

        appendWarning(extractWarnings(event.output));
        return;
      }

      if (event.type === "result") {
        setChatStatus("ready");
      }
    },
    [appendAssistantDelta, appendAssistantMessage, appendWarning]
  );

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => (
        <div
          key={message.id}
          className={`rounded-lg border p-3 ${
            message.role === "user"
              ? "border-slate-700 bg-slate-900/80"
              : "border-emerald-500/40 bg-emerald-500/10"
          }`}
        >
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{message.role}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{message.content}</p>
        </div>
      )),
    [messages]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const session = bridgeSessionRef.current;
      if (!session) {
        setError("Bridge session is not initialized yet.");
        return;
      }

      if (bridgeStatus !== "connected") {
        setError("Bridge is disconnected. Reload the page and reconnect.");
        return;
      }

      const trimmed = input.trim();
      if (!trimmed || chatStatus === "streaming") {
        return;
      }

      const composedPrompt = documentText.trim()
        ? `${trimmed}\n\nDocument:\n${documentText.trim()}`
        : trimmed;

      setError(null);
      setInput("");
      setChatStatus("streaming");
      assistantMessageIdRef.current = null;
      assistantContentRef.current = "";

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: trimmed
        }
      ]);

      try {
        const response = await fetch("/api/gemini-rpa/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            message: composedPrompt,
            session_id: geminiSessionId ?? undefined,
            sandbox_id: sandboxId ?? undefined,
            bridge_session_id: session.sessionId,
            bridge_token: session.token
          })
        });

        if (!response.ok || !response.body) {
          throw new Error(`Failed to start stream (${response.status}).`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const { objects, rest } = extractJsonObjects(buffer);
          buffer = rest;

          for (const objectText of objects) {
            try {
              const parsed = JSON.parse(objectText) as StreamEvent;
              handleStreamEvent(parsed);
            } catch {
              // Ignore malformed chunks.
            }
          }
        }

        if (buffer.trim().length > 0) {
          try {
            const parsed = JSON.parse(buffer) as StreamEvent;
            handleStreamEvent(parsed);
          } catch {
            // Ignore trailing partial buffer.
          }
        }

        setChatStatus("ready");
      } catch (streamError) {
        const message = streamError instanceof Error ? streamError.message : "Failed to stream response.";
        setError(message);
        setChatStatus("ready");
      }
    },
    [bridgeStatus, chatStatus, documentText, geminiSessionId, handleStreamEvent, input, sandboxId]
  );

  return (
    <main className="min-h-screen p-6 text-slate-100 sm:p-10">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <a
          href="/"
          className="rounded-md border border-slate-600 px-2 py-1 transition hover:border-slate-400"
        >
          Back to AI SDK demo
        </a>
        <span>bridge: {bridgeStatus}</span>
        <span>sandbox: {sandboxId ?? "-"}</span>
        <span>session: {geminiSessionId ?? "-"}</span>
      </div>

      <DemoForm />

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-700 bg-slate-950/90 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.15em] text-cyan-300">Gemini RPA Chat</p>
            <p className="text-[11px] text-slate-400">status: {chatStatus}</p>
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

          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

          <form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="e.g. Fill title and body with a concise summary"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || chatStatus !== "ready"}
              className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-950/85 p-4">
            <p className="text-sm font-medium text-slate-100">Tool Calls</p>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-slate-200">
              {tools.length === 0 ? (
                <p className="text-slate-500">No tool calls yet.</p>
              ) : (
                tools.map((tool) => (
                  <div key={tool.id} className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                    <p className="font-medium text-slate-100">{tool.toolName}</p>
                    <p className="mt-1 text-slate-400">id: {tool.toolId}</p>
                    <p className="mt-1 text-slate-400">status: {tool.status ?? "pending"}</p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-slate-400">details</summary>
                      <pre className="mt-1 whitespace-pre-wrap text-[11px] text-slate-300">
                        {JSON.stringify({ parameters: tool.parameters, output: tool.output }, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950/85 p-4">
            <p className="text-sm font-medium text-slate-100">Warnings</p>
            {warnings.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No warnings.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-amber-200">
                {warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>- {warning}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950/85 p-4">
            <p className="text-sm font-medium text-slate-100">stderr</p>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-rose-200">
              {stderrLogs.length === 0 ? (
                <p className="text-slate-500">No stderr logs.</p>
              ) : (
                stderrLogs.map((line, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only
                  <p key={index} className="whitespace-pre-wrap">
                    {line}
                  </p>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950/85 p-4 text-xs text-slate-300">
            <p>bridge session: {bridgeSession?.sessionId ?? "-"}</p>
            <p className="mt-1">expires at: {bridgeSession?.expiresAt ? new Date(bridgeSession.expiresAt).toISOString() : "-"}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
