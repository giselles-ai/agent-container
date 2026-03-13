"use client";

import { useChat } from "@ai-sdk/react";
import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";
import {
	ActionProvider,
	JSONUIProvider,
	Renderer,
	StateProvider,
	useJsonRenderMessage,
	VisibilityProvider,
} from "@json-render/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai";
import { type FormEvent, useState } from "react";
import { registry } from "@/lib/registry";
import { ChatMessage, ToolInvocationDisplay } from "./chat-message";

/**
 * Build an ordered list of "segments" from message parts, preserving the
 * interleaved order of text, tool-invocations and data-spec blocks.
 *
 * data-spec parts are cumulative JSON patches, so they always produce a
 * single Spec — but we record *where* in the part sequence the first
 * data-spec appeared so the rendered UI lands at the correct position
 * relative to surrounding text.
 */
function useOrderedSegments(message: UIMessage, isStreaming: boolean) {
	const { spec, hasSpec } = useJsonRenderMessage(
		message.parts as Array<{ type: string }>,
	);

	const segments: Array<
		| { kind: "text"; key: string; text: string; isStreaming: boolean }
		| { kind: "tool"; key: string; part: UIMessage["parts"][number] }
		| { kind: "spec"; key: string; spec: NonNullable<typeof spec> }
	> = [];

	let specInserted = false;

	for (let i = 0; i < message.parts.length; i++) {
		const part = message.parts[i];

		if (part.type === "dynamic-tool") {
			segments.push({ kind: "tool", key: `${message.id}-${i}`, part });
		} else if (part.type === "text") {
			segments.push({
				kind: "text",
				key: `${message.id}-${i}`,
				text: part.text,
				isStreaming: isStreaming && message.role === "assistant",
			});
		} else if (part.type === "data-spec" && !specInserted && hasSpec && spec) {
			specInserted = true;
			segments.push({
				kind: "spec",
				key: `${message.id}-spec`,
				spec,
			});
		}
	}

	return segments;
}

function MessageBubble({
	message,
	isStreaming,
}: {
	message: UIMessage;
	isStreaming: boolean;
}) {
	const segments = useOrderedSegments(message, isStreaming);

	return (
		<div
			className={`rounded-lg px-4 py-3 ${
				message.role === "user"
					? "ml-12 bg-blue-600/20 text-blue-100"
					: "mr-12 bg-gray-800 text-gray-200"
			}`}
		>
			{segments.map((seg) => {
				if (seg.kind === "tool") {
					const part = seg.part as Extract<
						UIMessage["parts"][number],
						{ type: "dynamic-tool" }
					>;
					return (
						<ToolInvocationDisplay
							key={seg.key}
							toolName={part.toolName}
							input={part.input as Record<string, unknown>}
							state={part.state}
							output={
								part.state === "output-available" ? part.output : undefined
							}
						/>
					);
				}
				if (seg.kind === "text") {
					return (
						<ChatMessage
							key={seg.key}
							id={seg.key}
							text={seg.text}
							isStreaming={seg.isStreaming}
						/>
					);
				}
				if (seg.kind === "spec") {
					return (
						<JSONUIProvider
							key={seg.key}
							registry={registry}
							initialState={seg.spec.state ?? {}}
						>
							<Renderer spec={seg.spec} registry={registry} />
						</JSONUIProvider>
					);
				}
				return null;
			})}
		</div>
	);
}

export function ChatUI({
	chatId,
	initialMessages,
}: {
	chatId?: string;
	initialMessages?: UIMessage[];
}) {
	const [input, setInput] = useState("");

	const browserTool = useBrowserToolHandler();
	const chatOptions = {
		transport: new DefaultChatTransport({
			api: "/api/chat",
		}),
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		...browserTool,
		...(chatId ? { id: chatId } : {}),
		...(initialMessages ? { messages: initialMessages } : {}),
	};

	const { status, messages, error, sendMessage, addToolOutput } = useChat({
		...chatOptions,
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
				<StateProvider initialState={{}}>
					<ActionProvider>
						<VisibilityProvider>
							{messages.length === 0 ? (
								<div className="flex h-full items-center justify-center">
									<p className="text-gray-500">
										Type a message to start a conversation
									</p>
								</div>
							) : (
								<div className="mx-auto max-w-3xl space-y-4">
									{messages.map((message) => (
										<MessageBubble
											key={message.id}
											message={message}
											isStreaming={status === "streaming"}
										/>
									))}
								</div>
							)}
						</VisibilityProvider>
					</ActionProvider>
				</StateProvider>

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
