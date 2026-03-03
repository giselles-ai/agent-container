"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
	DefaultChatTransport,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { type FormEvent, useCallback, useMemo, useState } from "react";

import { SpreadsheetGrid } from "./_components/spreadsheet-grid";

function textFromMessageParts(
	parts: Array<{ type: string; text?: string }>,
): string {
	return parts
		.map((part) => (part.type === "text" ? (part.text ?? "") : ""))
		.join("");
}

function toolNameFromPartType(partType: string): string {
	return partType.startsWith("tool-") ? partType.slice(5) : partType;
}

export default function SpreadsheetDemoPage() {
	const [input, setInput] = useState("");
	const [documentText, setDocumentText] = useState("");
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

	const renderedMessages = useMemo(
		() =>
			messages.map((message) => (
				<div
					key={message.id}
					className={`rounded-lg border p-3 ${
						message.role === "user"
							? "border-slate-700 bg-slate-900/80"
						: "border-cyan-500/40 bg-cyan-500/10"
					}`}
				>
					<p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
						{message.role}
					</p>
					<p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">
						{textFromMessageParts(message.parts)}
					</p>
				</div>
			)),
		[messages],
	);

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

	return (
		<main className="min-h-screen p-6 text-slate-100 sm:p-10">
			<div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
				<a
					href="/"
					className="rounded-md border border-slate-600 px-2 py-1 transition hover:border-slate-400"
				>
					Back to home
				</a>
				<span>agent: {status}</span>
			</div>

			<section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
				<div className="rounded-2xl border border-slate-700 bg-slate-950/90 p-4">
					<div className="mb-4">
						<p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">
							Sandbox Agent Spreadsheet
						</p>
						<h1 className="mt-2 text-xl font-semibold">Spreadsheet Demo</h1>
						<p className="mt-2 text-sm text-slate-300/90">
							The agent snapshots the grid, writes code in the sandbox, and fills
							cells with results.
						</p>
					</div>

					<SpreadsheetGrid rows={10} columns={6} />
				</div>

				<div className="space-y-4">
					<div className="rounded-2xl border border-slate-700 bg-slate-950/90 p-4">
						<div className="mb-3 flex items-center justify-between">
							<p className="text-xs uppercase tracking-[0.15em] text-cyan-300">
								Spreadsheet Chat
							</p>
							<p className="text-[11px] text-slate-400">status: {status}</p>
						</div>

						<label className="mb-3 block">
							<span className="mb-1 block text-xs text-slate-300">
								Document (optional)
							</span>
							<textarea
								rows={4}
								value={documentText}
								onChange={(event) => setDocumentText(event.target.value)}
								placeholder="Paste source document here"
								className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
							/>
						</label>

						<div className="max-h-72 space-y-2 overflow-y-auto pr-1">
							{renderedMessages}
						</div>

						{error ? (
							<p className="mt-2 text-xs text-rose-300">{error.message}</p>
						) : null}

						<form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
							<input
								value={input}
								onChange={(event) => setInput(event.target.value)}
								placeholder="e.g. Fill the first row with the names of 5 languages"
								className="flex-1 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
							/>
							<button
								type="submit"
								disabled={!input.trim() || isBusy}
								className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{isBusy ? "Running..." : "Send"}
							</button>
						</form>
					</div>

					<div className="rounded-2xl border border-slate-700 bg-slate-950/85 p-4">
						<p className="text-sm font-medium text-slate-100">Tool Calls</p>
						<div className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-slate-200">
							{toolParts.length === 0 ? (
								<p className="text-slate-500">No tool calls yet.</p>
							) : (
								toolParts.map((tool) => (
									<div
										key={tool.id}
										className="rounded-lg border border-slate-700 bg-slate-900/70 p-2"
									>
										<p className="font-medium text-slate-100">
											{tool.toolName}
										</p>
										<p className="mt-1 text-slate-400">id: {tool.toolCallId}</p>
										<p className="mt-1 text-slate-400">status: {tool.state}</p>
										{tool.errorText ? (
											<p className="mt-1 text-rose-300">{tool.errorText}</p>
										) : null}
										<details className="mt-2">
											<summary className="cursor-pointer text-slate-400">
												details
											</summary>
											<pre className="mt-1 whitespace-pre-wrap text-[11px] text-slate-300">
												{JSON.stringify(
													{ input: tool.input, output: tool.output },
													null,
													2,
												)}
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
								{warnings.map((warning) => (
									<li key={warning}>- {warning}</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</section>
		</main>
	);
}
