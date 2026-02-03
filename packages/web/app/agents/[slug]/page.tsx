"use client";

import { useChat } from "@ai-sdk/react";
import { type DataUIPart, DefaultChatTransport, type UIMessage } from "ai";
import { type FormEvent, useCallback, useMemo, useState, use } from "react";

type AgentDataParts = {
	stderr: { text: string };
	exit: { code: number };
};

type AgentUIMessage = UIMessage<never, AgentDataParts>;

type Props = {
	params: Promise<{ slug: string }>;
};

export default function AgentRunPage(props: Props) {
    const params = use(props.params);
    const [input, setInput] = useState("");
    const [stderrLines, setStderrLines] = useState<string[]>([]);
    const [exitCode, setExitCode] = useState<number | null>(null);

    const transport = useMemo(
		() =>
			new DefaultChatTransport<AgentUIMessage>({
				api: `/api/agents/${params.slug}/run`,
			}),
		[params.slug],
	);

    const onData = useCallback((dataPart: DataUIPart<AgentDataParts>) => {
		if (dataPart.type === "data-stderr") {
			setStderrLines((prev) => [...prev, dataPart.data.text]);
		}
		if (dataPart.type === "data-exit") {
			setExitCode(dataPart.data.code);
		}
	}, []);

    const { messages, sendMessage, status, stop, error } =
		useChat<AgentUIMessage>({
			transport,
			onData,
		});

    const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmed = input.trim();
			if (!trimmed) {
				return;
			}
			setExitCode(null);
			setStderrLines([]);
			await sendMessage({ text: trimmed });
			setInput("");
		},
		[input, sendMessage],
	);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8">
				<header className="mb-6">
					<p className="text-xs uppercase tracking-[0.3em] text-slate-400">
						Agent
					</p>
					<h1 className="mt-2 text-3xl font-semibold text-slate-50">
						Run {params.slug}
					</h1>
					<p className="mt-2 text-sm text-slate-400">
						Send prompts to the agent and stream stdout back.
					</p>
				</header>

				<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
					<section className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
						<div className="flex items-center justify-between border-b border-slate-800 pb-3">
							<div>
								<p className="text-sm font-medium">Conversation</p>
								<p className="text-xs text-slate-400">Status: {status}</p>
							</div>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => stop()}
									disabled={status !== "streaming"}
									className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
								>
									Stop
								</button>
							</div>
						</div>

						<div className="mt-4 flex-1 space-y-4 overflow-y-auto">
							{messages.length === 0 ? (
								<p className="text-sm text-slate-500">
									Type a message to start streaming.
								</p>
							) : (
								messages.map((message) => {
									const text = message.parts
										.filter((part) => part.type === "text")
										.map((part) => part.text)
										.join("");
									return (
										<div
											key={message.id}
											className={`rounded-xl border px-4 py-3 text-sm ${
												message.role === "user"
													? "border-slate-700 bg-slate-800/60"
													: "border-indigo-500/40 bg-indigo-500/10"
											}`}
										>
											<p className="text-xs uppercase tracking-wide text-slate-400">
												{message.role}
											</p>
											<p className="mt-2 whitespace-pre-wrap text-slate-100">
												{text || "..."}
											</p>
										</div>
									);
								})
							)}
						</div>

						<form
							onSubmit={handleSubmit}
							className="mt-4 flex items-center gap-2"
						>
							<input
								value={input}
								onChange={(event) => setInput(event.target.value)}
								placeholder="Send a prompt..."
								className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400"
							/>
							<button
								type="submit"
								disabled={!input.trim() || status === "submitted"}
								className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
							>
								Send
							</button>
						</form>
						{error ? (
							<p className="mt-2 text-xs text-rose-400">{error.message}</p>
						) : null}
					</section>

					<aside className="flex flex-col gap-4">
						<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-sm font-medium">stderr stream</p>
							<div className="mt-3 space-y-2 text-xs text-amber-300">
								{stderrLines.length === 0 ? (
									<p className="text-slate-500">No stderr yet.</p>
								) : (
									stderrLines.map((line, index) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: stderrLines in append-only
										(<p key={index} className="whitespace-pre-wrap">
                                            {line}
                                        </p>)
									))
								)}
							</div>
						</div>
						<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-sm font-medium">exit code</p>
							<p className="mt-3 text-2xl font-semibold text-slate-100">
								{exitCode ?? "—"}
							</p>
						</div>
					</aside>
				</div>
			</div>
        </div>
    );
}
