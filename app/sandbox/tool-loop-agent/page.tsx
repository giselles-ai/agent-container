"use client";

import { useChat } from "@ai-sdk/react";
import { type DataUIPart, DefaultChatTransport, type UIMessage } from "ai";
import { type FormEvent, useCallback, useMemo, useState } from "react";

type SandboxDataParts = {
	stderr: { text: string };
	exit: { code: number };
};

type SandboxUIMessage = UIMessage<never, SandboxDataParts>;

export default function SandboxStreamPage() {
	const [input, setInput] = useState("");
	const [stderrLines, setStderrLines] = useState<string[]>([]);
	const [exitCode, setExitCode] = useState<number | null>(null);

	const transport = useMemo(
		() =>
			new DefaultChatTransport<SandboxUIMessage>({
				api: "/sandbox/tool-loop-agent/api",
			}),
		[],
	);

	const onData = useCallback((dataPart: DataUIPart<SandboxDataParts>) => {
		if (dataPart.type === "data-stderr") {
			setStderrLines((prev) => [...prev, dataPart.data.text]);
		}
		if (dataPart.type === "data-exit") {
			setExitCode(dataPart.data.code);
		}
	}, []);

	const { messages, sendMessage, status, stop, error } =
		useChat<SandboxUIMessage>({
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
						Sandbox stream
					</p>
					<h1 className="mt-2 text-3xl font-semibold text-slate-50">
						UIMessage Stream Demo
					</h1>
					<p className="mt-2 text-sm text-slate-400">
						Streaming stdout as assistant text. stderr/exit are handled via
						onData.
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
								messages.map((message) => (
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
										<div className="mt-2 space-y-2">
											{message.parts.map((part, index) => {
												if (part.type === "text") {
													return (
														<p
															key={`text-${index}`}
															className="whitespace-pre-wrap text-slate-100"
														>
															{part.text}
														</p>
													);
												}
												if (part.type === "step-start") {
													return (
														<hr
															key={`step-${index}`}
															className="border-slate-700"
														/>
													);
												}
												if (
													part.type === "dynamic-tool" ||
													part.type.startsWith("tool-")
												) {
													const toolPart = part as {
														type: string;
														toolCallId: string;
														toolName?: string;
														state: string;
														input?: unknown;
														output?: unknown;
													};
													const toolName =
														toolPart.toolName ??
														toolPart.type.replace(/^tool-/, "");
													return (
														<div
															key={toolPart.toolCallId}
															className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"
														>
															<p className="text-xs font-medium text-emerald-400">
																Tool: {toolName}
															</p>
															<p className="mt-1 text-xs text-slate-400">
																State: {toolPart.state}
															</p>
															{toolPart.state !== "input-streaming" &&
															toolPart.input != null ? (
																<details className="mt-2">
																	<summary className="cursor-pointer text-xs text-slate-400">
																		Input
																	</summary>
																	<pre className="mt-1 overflow-x-auto text-xs text-slate-300">
																		{JSON.stringify(toolPart.input, null, 2)}
																	</pre>
																</details>
															) : null}
															{toolPart.state === "output-available" &&
															toolPart.output != null ? (
																<details className="mt-2">
																	<summary className="cursor-pointer text-xs text-slate-400">
																		Output
																	</summary>
																	<pre className="mt-1 overflow-x-auto text-xs text-slate-300">
																		{JSON.stringify(toolPart.output, null, 2)}
																	</pre>
																</details>
															) : null}
														</div>
													);
												}
												return null;
											})}
										</div>
									</div>
								))
							)}
						</div>

						<form
							onSubmit={handleSubmit}
							className="mt-4 flex items-center gap-2"
						>
							<input
								value={input}
								onChange={(event) => setInput(event.target.value)}
								placeholder="Say something..."
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
										<p key={index} className="whitespace-pre-wrap">
											{line}
										</p>
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
