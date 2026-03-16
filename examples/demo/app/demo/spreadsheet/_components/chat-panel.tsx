"use client";

import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import {
	type FormEvent,
	forwardRef,
	useCallback,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { Streamdown } from "streamdown";

function toolNameFromPartType(partType: string): string {
	return partType.startsWith("tool-") ? partType.slice(5) : partType;
}

export interface ChatPanelHandle {
	setInput: (value: string) => void;
}

interface SuggestedPrompt {
	label: string;
	prompt: string;
}

interface ChatPanelProps {
	messages: UIMessage[];
	status: string;
	error: Error | undefined;
	isBusy: boolean;
	onSendMessage: (params: { text: string }) => Promise<void>;
	warnings: string[];
	suggestedPrompts?: readonly SuggestedPrompt[];
	devToolOpen?: boolean;
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
	function ChatPanel(
		{
			messages,
			status,
			error,
			isBusy,
			onSendMessage,
			warnings,
			suggestedPrompts,
			devToolOpen = false,
		},
		ref,
	) {
		const [input, setInput] = useState("");
		const [documentText, setDocumentText] = useState("");
		const messagesEndRef = useRef<HTMLDivElement>(null);

		useImperativeHandle(ref, () => ({ setInput }), []);

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
					await onSendMessage({ text: composedPrompt });
					setInput("");
				} catch {
					// Error state is surfaced by useChat.
				}
			},
			[documentText, input, isBusy, onSendMessage],
		);

		return (
			<aside className="flex w-80 shrink-0 flex-col border-l border-slate-800 lg:w-96">
				{/* Chat messages */}
				<div className="flex-1 overflow-y-auto p-3">
					<div className="space-y-2">
						{messages.length === 0 ? (
							<p className="py-8 text-center text-xs text-slate-600">
								Send a prompt to get started
							</p>
						) : (
							messages.map((message) =>
								message.role === "user" ? (
									<div key={message.id} className="flex justify-end">
										<div className="max-w-[85%] rounded-lg bg-slate-800/60 px-3 py-2 text-[13px] leading-relaxed text-slate-200">
											{message.parts.map((part, index) => {
												if (part.type === "text") {
													return (
														<p
															// biome-ignore lint/suspicious/noArrayIndexKey: render-only list, no reordering
															key={`${message.id}-${index}`}
															className="whitespace-pre-wrap"
														>
															{part.text}
														</p>
													);
												}
												return null;
											})}
										</div>
									</div>
								) : (
									<div
										key={message.id}
										className="text-[13px] leading-relaxed text-slate-300"
									>
										{message.parts.map((part, index) => {
											if (part.type === "text") {
												return (
													<Streamdown
														// biome-ignore lint/suspicious/noArrayIndexKey: render-only list, no reordering
														key={`${message.id}-${index}`}
														isAnimating={status === "streaming"}
													>
														{part.text}
													</Streamdown>
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
								),
							)
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

				{/* Suggested prompts — shown when no messages yet */}
				{suggestedPrompts &&
					suggestedPrompts.length > 0 &&
					messages.length === 0 &&
					!input.trim() && (
						<div className="shrink-0 border-t border-slate-800/60 px-3 py-2">
							<div className="flex flex-wrap gap-2">
								{suggestedPrompts.map((sp) => (
									<button
										key={sp.label}
										type="button"
										onClick={() => setInput(sp.prompt)}
										className="rounded-full border border-slate-700/60 px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
									>
										{sp.label}
									</button>
								))}
							</div>
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
								<p className="text-[11px] text-slate-600">No tool calls yet.</p>
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
		);
	},
);
