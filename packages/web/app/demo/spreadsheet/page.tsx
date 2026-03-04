"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useRef, useState } from "react";

import { ChatPanel, type ChatPanelHandle } from "./_components/chat-panel";
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

export default function SpreadsheetDemoPage() {
	const chatRef = useRef<ChatPanelHandle>(null);
	const [gridKey, setGridKey] = useState(0);
	const [warnings, setWarnings] = useState<string[]>([]);

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

	const handlePromptSelect = (prompt: string) => {
		chatRef.current?.setInput(prompt);
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

				{/* ── Right Panel: Chat ── */}
				<ChatPanel
					ref={chatRef}
					messages={messages}
					status={status}
					error={error}
					isBusy={isBusy}
					onSendMessage={sendMessage}
					warnings={warnings}
				/>
			</div>
		</div>
	);
}
