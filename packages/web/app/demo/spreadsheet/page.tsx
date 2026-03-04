"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
	DefaultChatTransport,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { type FormEvent, useCallback, useMemo, useRef, useState } from "react";

import { SpreadsheetGrid } from "./_components/spreadsheet-grid";

const SUGGESTED_PROMPTS = [
	{
		label: "GitHub repo comparison",
		prompt:
			"Fill the form fields with a comparison of vercel/next.js, facebook/react, and sveltejs/svelte. Use the header fields for repo names and the row fields for metrics: commits, PRs merged, contributors, and releases over the past year. Also check which coding agents (AGENTS.md, .cursor, .codex) each repo uses.",
	},
	{
		label: "npm download trends",
		prompt:
			"Fill the form fields with npm download data. Use the header fields for package names (zod, yup, joi) and the row fields for monthly download counts over the last 6 months.",
	},
	{
		label: "Language comparison",
		prompt:
			"Fill the form fields with a comparison of Python, JavaScript, and Rust. Use the header fields for language names and the row fields for: typing system, package manager, typical use cases, GitHub stars of main repo.",
	},
] as const;

function toolNameFromPartType(partType: string): string {
	return partType.startsWith("tool-") ? partType.slice(5) : partType;
}

export default function SpreadsheetDemoPage() {
	const [input, setInput] = useState("");
	const [gridKey, setGridKey] = useState(0);
	const [documentText, setDocumentText] = useState("");
	const [warnings, setWarnings] = useState<string[]>([]);
	const [devToolOpen, setDevToolOpen] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const browserTool = useBrowserToolHandler({
		onWarnings: (next) =>
			setWarnings((current) => [...new Set([...current, ...next])]),
	});

	const { status, messages, error, sendMessage, addToolOutput } = useChat({
		transport: new DefaultChatTransport({
			api: "/api/chat",
			body: {
				providerOptions: {
					giselle: {
						agent: { type: "codex" },
					},
				},
			},
		}),
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		...browserTool,
		onError: (chatError) => {
			console.error("Chat error", chatError);
		},
	});

	browserTool.connect(addToolOutput);

	const isBusy = status === "submitted" || status === "streaming";

	const toolParts = useMemo(
		() =>
			messages.flatMap((message) => {
				if (message.role !== "assistant") {
					return [];
				}

				return message.parts.filter(isToolUIPart).map((part) => ({
					id: `${message.id}:${part.toolCallId}`,
					toolName: toolNameFromPartType(part.type),
					toolCallId: part.toolCallId,
					state: part.state,
					input: "input" in part ? part.input : undefined,
					output: "output" in part ? part.output : undefined,
					errorText: "errorText" in part ? part.errorText : undefined,
				}));
			}),
		[messages],
	);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();

			const trimmedMessage = input.trim();
			if (!trimmedMessage || isBusy) {
				return;
			}

			const trimmedDocument = documentText.trim();
			const composedPrompt = trimmedDocument
				? `${trimmedMessage}\n\nDocument:\n${trimmedDocument}`
				: trimmedMessage;

			try {
				await sendMessage({ text: composedPrompt });
				setInput("");
			} catch {
				// Error state is surfaced by useChat.
			}
		},
		[documentText, input, isBusy, sendMessage],
	);

	const handlePromptSelect = (prompt: string) => {
		setInput(prompt);
	};

	const handleClear = () => {
		setGridKey((key) => key + 1);
	};

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-[#0e0e10]">
			{/* ── Top Bar ── */}
			<header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-4">
				<div className="flex items-center gap-3">
					<h1
						className="text-sm font-semibold tracking-wide text-slate-100"
						style={{ fontFamily: "var(--font-tomorrow)" }}
					>
						Sheet Fill Agent
					</h1>
					{isBusy && (
						<span className="flex items-center gap-1.5 text-[11px] text-cyan-400">
							<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
							Working…
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleClear}
						className="rounded px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
					>
						Clear
					</button>
					<button
						type="button"
						onClick={() => setDevToolOpen((open) => !open)}
						className={`rounded px-2 py-1 text-[11px] transition ${
							devToolOpen
								? "bg-slate-700 text-slate-200"
								: "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
						}`}
					>
						dev tool
					</button>
				</div>
			</header>

			{/* ── Main Area ── */}
			<div className="flex min-h-0 flex-1">
				{/* ── Spreadsheet (primary) ── */}
				<main className="flex min-w-0 flex-1 flex-col">
					<div className="flex-1 overflow-auto p-4">
						<SpreadsheetGrid
							key={gridKey}
							rows={10}
							columns={6}
							isBusy={isBusy}
						/>
					</div>

					{/* Suggested prompts — shown when no messages yet */}
					{messages.length === 0 && (
						<div className="shrink-0 border-t border-slate-800/60 px-4 py-3">
							<div className="flex flex-wrap gap-2">
								{SUGGESTED_PROMPTS.map((prompt) => (
									<button
										key={prompt.label}
										type="button"
										onClick={() => handlePromptSelect(prompt.prompt)}
										className="rounded-full border border-slate-700/60 px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
									>
										{prompt.label}
									</button>
								))}
							</div>
						</div>
					)}
				</main>

				{/* ── Right Panel: Chat + Dev Tool ── */}
				<aside className="flex w-80 shrink-0 flex-col border-l border-slate-800 lg:w-96">
					{/* Chat messages */}
					<div className="flex-1 overflow-y-auto p-3">
						<div className="space-y-2">
							{messages.length === 0 ? (
								<p className="py-8 text-center text-xs text-slate-600">
									Send a prompt to get started
								</p>
							) : (
								messages.map((message) => (
									<div
										key={message.id}
										className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
											message.role === "user"
												? "bg-slate-800/60 text-slate-200"
												: "bg-cyan-500/8 text-slate-300"
										}`}
									>
										<p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
											{message.role}
										</p>
										{message.parts.map((part, index) => {
											if (part.type === "text") {
												return (
													<p
														key={`${message.id}-${index}`}
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
														className="my-1.5 rounded border border-slate-700/60 bg-slate-900/40 px-2 py-1.5 text-[11px]"
													>
														<span className="font-medium text-cyan-400/80">
															🔧 {toolNameFromPartType(part.type)}
														</span>
														<span className="ml-2 text-slate-500">
															{part.state}
														</span>
													</div>
												);
											}
											return null;
										})}
									</div>
								))
							)}
							<div ref={messagesEndRef} />
						</div>

						{error && (
							<p className="mt-2 text-xs text-rose-400">{error.message}</p>
						)}
					</div>

					{/* Document textarea (collapsible) */}
					{documentText && (
						<div className="border-t border-slate-800/60 px-3 py-2">
							<textarea
								rows={3}
								value={documentText}
								onChange={(event) => setDocumentText(event.target.value)}
								placeholder="Paste source document here"
								className="w-full rounded border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
							/>
						</div>
					)}

					{/* Input box — pinned at bottom */}
					<div className="shrink-0 border-t border-slate-800 p-3">
						<form className="flex gap-2" onSubmit={handleSubmit}>
							<input
								value={input}
								onChange={(event) => setInput(event.target.value)}
								placeholder="Ask the agent to fill the spreadsheet…"
								className="flex-1 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/60"
							/>
							<button
								type="submit"
								disabled={!input.trim() || isBusy}
								className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
							>
								{isBusy ? "…" : "Send"}
							</button>
						</form>
						<button
							type="button"
							onClick={() => setDocumentText((prev) => (prev ? "" : " "))}
							className="mt-1.5 text-[10px] text-slate-600 transition hover:text-slate-400"
						>
							{documentText ? "Hide document" : "+ Attach document"}
						</button>
					</div>

					{/* ── Dev Tool Panel ── */}
					{devToolOpen && (
						<div className="shrink-0 border-t border-slate-800 bg-slate-950/80">
							<div className="max-h-56 overflow-y-auto p-3">
								<p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
									Tool Calls
								</p>
								{toolParts.length === 0 ? (
									<p className="text-[11px] text-slate-600">
										No tool calls yet.
									</p>
								) : (
									<div className="space-y-1.5">
										{toolParts.map((tool) => (
											<details
												key={tool.id}
												className="rounded border border-slate-800 bg-slate-900/50 text-[11px]"
											>
												<summary className="cursor-pointer px-2 py-1.5 text-slate-300">
													<span className="font-medium">{tool.toolName}</span>
													<span className="ml-2 text-slate-500">
														{tool.state}
													</span>
													{tool.errorText && (
														<span className="ml-2 text-rose-400">error</span>
													)}
												</summary>
												<pre className="whitespace-pre-wrap px-2 pb-2 text-[10px] text-slate-400">
													{JSON.stringify(
														{ input: tool.input, output: tool.output },
														null,
														2,
													)}
												</pre>
											</details>
										))}
									</div>
								)}

								{warnings.length > 0 && (
									<>
										<p className="mb-1 mt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
											Warnings
										</p>
										<ul className="space-y-0.5 text-[11px] text-amber-300/80">
											{warnings.map((warning) => (
												<li key={warning}>• {warning}</li>
											))}
										</ul>
									</>
								)}
							</div>
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}
