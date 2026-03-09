"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { FormEvent } from "react";
import { useState } from "react";

const SUGGESTED_PROMPTS = [
  {
    label: "GitHub repo comparison",
    prompt:
      "Compare the GitHub repos for next.js, react, and svelte. Include commit count, PRs, contributors, and recent activity.",
  },
  {
    label: "npm download trends",
    prompt:
      "Compare zod, yup, and joi over the last 12 months. Put monthly downloads and a short note about their typical use cases into the spreadsheet.",
  },
  {
    label: "Language comparison",
    prompt:
      "Compare Python, JavaScript, and Rust. Include type system, package manager, primary use case, and learning curve.",
  },
] as const;

function getColumnLabel(index: number): string {
  let label = "";
  let value = index;

  while (value >= 0) {
    label = String.fromCharCode((value % 26) + 65) + label;
    value = Math.floor(value / 26) - 1;
  }

  return label;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
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
    <div className="relative overflow-x-auto rounded-[28px] border border-white/10 bg-[#101822]/80 p-3 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr>
            <th className="w-px border border-white/10 bg-[#0d141c] px-2 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-[#7b8a98]">
              Row
            </th>
            {Array.from({ length: columns }).map((_, columnIndex) => {
              const headerId = `header-${columnIndex}`;

              return (
                <th
                  key={headerId}
                  className="border border-white/10 bg-[#111d29]"
                >
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
                    aria-label={`Header column ${columnIndex + 1}`}
                    className="block w-full border-none bg-transparent px-3 py-2 text-sm font-medium text-[#f4f7fb] outline-none placeholder:text-[#667789] focus:bg-[#152434]"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are a fixed-size grid with no reordering
            <tr key={`row-${rowIndex}`}>
              <td className="w-px whitespace-nowrap border border-white/10 bg-[#0d141c]">
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
                  aria-label={`Row ${rowIndex + 1} header`}
                  className="block min-w-12 border-none bg-transparent px-3 py-2 text-xs text-[#7b8a98] outline-none placeholder:text-[#7b8a98] focus:bg-[#152434]"
                />
              </td>
              {Array.from({ length: columns }).map((_, columnIndex) => {
                const cellId = `cell-${rowIndex}-${columnIndex}`;

                return (
                  <td
                    key={cellId}
                    className="border border-white/10 bg-[#0f1822]"
                  >
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
                      aria-label={`Cell row ${rowIndex + 1} column ${
                        columnIndex + 1
                      }`}
                      className="block w-full border-none bg-transparent px-3 py-2 text-sm text-[#edf2f7] outline-none focus:bg-[#152434]"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {isBusy && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[28px] animate-[shimmer_2.8s_linear_infinite]"
          style={{
            backgroundImage: `linear-gradient(
              105deg,
              transparent 40%,
              rgba(61, 241, 212, 0.01) 43%,
              rgba(61, 241, 212, 0.03) 47%,
              rgba(61, 241, 212, 0.06) 50%,
              rgba(61, 241, 212, 0.03) 53%,
              rgba(61, 241, 212, 0.01) 57%,
              transparent 60%
            )`,
            backgroundSize: "200% 100%",
          }}
        />
      )}
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [gridKey, setGridKey] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);

  const browserTool = useBrowserToolHandler({
    onWarnings: (next) =>
      setWarnings((current) => dedupeStrings([...current, ...next])),
  });

  const { status, messages, error, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({
      api: "/chat",
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    ...browserTool,
    onError: (chatError) => {
      console.error("Chat error", chatError);
    },
  });

  browserTool.connect(addToolOutput);

  const isBusy = status === "submitted" || status === "streaming";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isBusy) {
      return;
    }

    try {
      await sendMessage({ text: trimmed });
      setInput("");
    } catch {
      // useChat exposes the error state.
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(61,241,212,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(255,176,110,0.16),_transparent_28%),linear-gradient(180deg,_#06090d_0%,_#0b1118_100%)] px-4 py-6 text-[#f4f7fb] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col gap-4">
        <header className="rounded-[28px] border border-white/10 bg-[#0d141c]/80 px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[#6ffff0]">
                Minimum Demo
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Spreadsheet Fill Agent
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9ab0c4]">
                Ask the agent to compare products, languages, libraries, or any
                structured topic. It should inspect the grid and populate it
                directly through browser-tool actions.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#c9d5e1]">
                status: {status}
              </span>
              {isBusy && (
                <span className="rounded-full border border-[#3df1d4]/30 bg-[#3df1d4]/10 px-3 py-1 text-xs text-[#78f5e0]">
                  working
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setGridKey((current) => current + 1);
                  setWarnings([]);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#f4f7fb] transition hover:border-[#ffb06e]/60 hover:bg-[#ffb06e]/10"
              >
                Clear grid
              </button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_380px]">
          <section className="min-h-[520px] rounded-[32px] border border-white/10 bg-[#0a1219]/70 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.35)] backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#7b8a98]">
                  Grid
                </p>
                <p className="mt-1 text-sm text-[#9ab0c4]">
                  Headers and cells are editable inputs with stable browser-tool
                  ids.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#9ab0c4]">
                10 x 6
              </div>
            </div>
            <SpreadsheetGrid
              key={gridKey}
              rows={10}
              columns={6}
              isBusy={isBusy}
            />
          </section>

          <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#11131a]/88 shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="border-b border-white/10 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#ffb06e]">
                Chat Panel
              </p>
              <p className="mt-1 text-sm text-[#9ab0c4]">
                Prompt the agent and watch tool calls fill the spreadsheet.
              </p>
            </div>

            {warnings.length > 0 && (
              <div className="border-b border-[#ffb06e]/20 bg-[#ffb06e]/8 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#ffcf9d]">
                  Warnings
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-[#ffd8b3]">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5">
                  <p className="text-sm leading-6 text-[#9ab0c4]">
                    Start with one of the suggested prompts or ask for a custom
                    comparison. The agent should inspect the current spreadsheet
                    and write the result into the cells.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "ml-8 border border-[#3df1d4]/20 bg-[#0f2326]"
                      : "mr-8 border border-white/10 bg-white/4"
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#7b8a98]">
                    {message.role}
                  </p>
                  <div className="mt-2 space-y-2 text-sm leading-6 text-[#edf2f7]">
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return (
                          <p
                            key={`${message.id}-text-${index}`}
                            className="whitespace-pre-wrap"
                          >
                            {part.text}
                          </p>
                        );
                      }

                      if (isToolUIPart(part)) {
                        return (
                          <div
                            key={`${message.id}-${part.toolCallId}`}
                            className="rounded-xl border border-[#ffb06e]/20 bg-[#2b1d12]/50 px-3 py-2 text-xs text-[#ffd8b3]"
                          >
                            {part.type.replace(/^tool-/, "")}: {part.state}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>
              ))}

              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error.message}
                </div>
              )}
            </div>

            {messages.length === 0 && !input.trim() && (
              <div className="border-t border-white/10 px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => setInput(prompt.prompt)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#c9d5e1] transition hover:border-[#3df1d4]/40 hover:bg-[#3df1d4]/10 hover:text-white"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-white/10 px-4 py-4">
              <form className="space-y-3" onSubmit={handleSubmit}>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={4}
                  placeholder="Ask the agent to fill the spreadsheet..."
                  className="w-full resize-none rounded-2xl border border-white/10 bg-[#0a1219] px-4 py-3 text-sm text-[#f4f7fb] outline-none placeholder:text-[#667789] focus:border-[#3df1d4]/50"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#7b8a98]">
                    Tool calls are executed in the browser against the visible
                    grid.
                  </p>
                  <button
                    type="submit"
                    disabled={!input.trim() || isBusy}
                    className="rounded-full bg-[#3df1d4] px-4 py-2 text-sm font-medium text-[#051219] transition hover:bg-[#74f7e3] disabled:cursor-not-allowed disabled:bg-[#25423d] disabled:text-[#8ab8b0]"
                  >
                    {isBusy ? "Sending..." : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
