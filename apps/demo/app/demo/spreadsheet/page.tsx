"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useRef, useState } from "react";

import { createGiselleChatTransport } from "../../_lib/giselle-chat-transport";
import { ChatPanel, type ChatPanelHandle } from "./_components/chat-panel";
import { SpreadsheetGrid } from "./_components/spreadsheet-grid";

const SPREADSHEET_AGENT_PROMPT = `You are a helpful assistant embedded in a spreadsheet application. The user is chatting with you from a chat panel displayed to the right of a spreadsheet grid.

## Page Structure
- The page has two main areas: a spreadsheet grid on the left and a chat panel (where the user talks to you) on the right.
- The spreadsheet has a header row for column names and data rows below it.
- You can inspect the current state of the spreadsheet by calling the getFormSnapshot tool.
- You can fill or update cells by calling the executeFormActions tool.

## How to Work
1. Understand what the user wants to know or compare from their message.
2. If their intent is unclear or there are multiple possible interpretations, ask clarifying questions before proceeding.
3. Once the direction is clear, think about how to best represent the information in a tabular format (what should be columns, what should be rows).
4. Research the topic — look up data, and if needed, run analysis code to produce accurate results.
5. Once the data is ready, call getFormSnapshot to see the current form fields, then call executeFormActions to fill the spreadsheet.

## Important
- Keep column headers short and clear.
- Always fill the spreadsheet — don't just describe what you would do.`;

const SUGGESTED_PROMPTS = [
	{
		label: "GitHub repo comparison",
		prompt:
			"Compare the GitHub repos for next.js, react, and svelte. Include commit count, PRs, contributors, etc.",
	},
	{
		label: "npm download trends",
		prompt:
			"Summarize the npm download numbers for zod, yup, and joi over the last 12 months.",
	},
	{
		label: "Language comparison",
		prompt:
			"Compare Python, JavaScript, and Rust. Cover type systems, package managers, primary use cases, etc.",
	},
] as const;

export default function SpreadsheetDemoPage() {
	const chatRef = useRef<ChatPanelHandle>(null);
	const [gridKey, setGridKey] = useState(0);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [devToolOpen, setDevToolOpen] = useState(false);

	const browserTool = useBrowserToolHandler({
		onWarnings: (next) =>
			setWarnings((current) => [...new Set([...current, ...next])]),
	});

	const { status, messages, error, sendMessage, addToolOutput } = useChat({
		transport: createGiselleChatTransport({
			api: "/api/chat",
			body: {
				providerOptions: {
					giselle: {
						agent: { type: "codex", prompt: SPREADSHEET_AGENT_PROMPT },
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
						onClick={() => setDevToolOpen((prev) => !prev)}
						className={`rounded px-2 py-1 text-[11px] transition hover:bg-slate-800 hover:text-slate-200 ${devToolOpen ? "text-cyan-400" : "text-slate-400"}`}
					>
						Dev Tool
					</button>
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
					suggestedPrompts={SUGGESTED_PROMPTS}
					devToolOpen={devToolOpen}
				/>
			</div>
		</div>
	);
}
