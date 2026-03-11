"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { type FormEvent, useState } from "react";

export default function NewChatPage() {
	const [input, setInput] = useState("");

	const browserTool = useBrowserToolHandler();

	const { status, messages, error, sendMessage, addToolOutput } = useChat({
		transport: new DefaultChatTransport({
			api: "/api/chat",
		}),
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		...browserTool,
	});

	browserTool.connect(addToolOutput);

	const isBusy = status === "submitted" || status === "streaming";

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		const trimmed = input.trim();
		if (!trimmed || isBusy) return;

		await sendMessage({ text: trimmed });
		setInput("");
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-y-auto p-4">
				{messages.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<p className="text-gray-500">
							Type a message to start a conversation
						</p>
					</div>
				) : (
					<div className="mx-auto max-w-3xl space-y-4">
						{messages.map((message) => (
							<div
								key={message.id}
								className={`rounded-lg px-4 py-3 ${
									message.role === "user"
										? "ml-12 bg-blue-600/20 text-blue-100"
										: "mr-12 bg-gray-800 text-gray-200"
								}`}
							>
								{message.parts.map((part, i) => {
									if (part.type === "text") {
										return (
											<p
												// biome-ignore lint/suspicious/noArrayIndexKey: render-only list, no reordering
												key={`${message.id}-${i}`}
												className="whitespace-pre-wrap text-sm"
											>
												{part.text}
											</p>
										);
									}
									return null;
								})}
							</div>
						))}
					</div>
				)}

				{error && (
					<div className="mx-auto mt-4 max-w-3xl rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
						{error.message}
					</div>
				)}
			</div>

			<div className="border-t border-gray-800 p-4">
				<form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-2">
					<input
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Type a message..."
						className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
					<button
						type="submit"
						disabled={!input.trim() || isBusy}
						className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isBusy ? "Sending..." : "Send"}
					</button>
				</form>
			</div>
		</div>
	);
}
