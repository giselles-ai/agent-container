"use client";

import { type FormEvent, useCallback, useRef, useState } from "react";

interface NdjsonEvent {
	type: string;
	role?: string;
	content?: string;
	text?: string;
	sandbox_id?: string;
	session_id?: string;
	[key: string]: unknown;
}

export default function CodexLocalPage() {
	const [message, setMessage] = useState("");
	const [events, setEvents] = useState<NdjsonEvent[]>([]);
	const [sandboxId, setSandboxId] = useState<string | undefined>();
	const [sessionId, setSessionId] = useState<string | undefined>();
	const [isBusy, setIsBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();

			const trimmed = message.trim();
			if (!trimmed || isBusy) {
				return;
			}

			setIsBusy(true);
			setError(null);

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				const response = await fetch("/api/codex-local", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						message: trimmed,
						session_id: sessionId,
						sandbox_id: sandboxId,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					const text = await response.text();
					setError(`${response.status}: ${text}`);
					setIsBusy(false);
					return;
				}

				const reader = response.body?.getReader();
				if (!reader) {
					setError("No response body");
					setIsBusy(false);
					return;
				}

				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						const trimmedLine = line.trim();
						if (!trimmedLine) {
							continue;
						}

						try {
							const parsed = JSON.parse(trimmedLine) as NdjsonEvent;
							setEvents((prev) => [...prev, parsed]);

							if (parsed.sandbox_id) {
								setSandboxId(parsed.sandbox_id);
							}
							if (parsed.session_id) {
								setSessionId(parsed.session_id);
							}
						} catch {
							// skip malformed lines
						}
					}
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") {
					// user cancelled
				} else {
					setError(err instanceof Error ? err.message : "Unknown error");
				}
			} finally {
				setIsBusy(false);
				abortRef.current = null;
			}
		},
		[isBusy, message, sandboxId, sessionId],
	);

	const assistantMessages = events.filter(
		(e) => e.type === "message" && e.role === "assistant",
	);

	const stderrEvents = events.filter((e) => e.type === "stderr");

	return (
		<main className="min-h-screen p-6 text-slate-100 sm:p-10">
			<div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
				<a
					href="/"
					className="rounded-md border border-slate-600 px-2 py-1 transition hover:border-slate-400"
				>
					Back to home
				</a>
				<span>status: {isBusy ? "running" : "idle"}</span>
				{sandboxId ? <span>sandbox: {sandboxId}</span> : null}
				{sessionId ? <span>session: {sessionId}</span> : null}
			</div>

			<section className="mx-auto max-w-3xl rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-2xl backdrop-blur">
				<p className="text-xs uppercase tracking-[0.18em] text-orange-300/80">
					Codex Local Demo
				</p>
				<h1 className="mt-2 text-3xl font-semibold">
					Direct Sandbox Execution
				</h1>
				<p className="mt-3 text-sm text-slate-300/90">
					Runs Codex in a Vercel Sandbox directly via{" "}
					<code className="mx-1 rounded bg-slate-800 px-1 py-0.5">
						/api/codex-local
					</code>{" "}
					without Cloud API, auth, or browser tools.
				</p>

				<form className="mt-6 flex gap-2" onSubmit={handleSubmit}>
					<textarea
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						placeholder="Enter a message for Codex..."
						rows={3}
						className="flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-orange-400"
					/>
					<button
						type="submit"
						disabled={!message.trim() || isBusy}
						className="self-end rounded-lg bg-orange-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isBusy ? "Running..." : "Send"}
					</button>
				</form>

				{error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
			</section>

			{assistantMessages.length > 0 ? (
				<section className="mx-auto mt-6 max-w-3xl space-y-2">
					<p className="text-xs uppercase tracking-[0.15em] text-orange-300">
						Assistant Messages
					</p>
					{assistantMessages.map((msg, i) => (
						<div
							key={`msg-${
								// biome-ignore lint/suspicious/noArrayIndexKey: streaming events have no stable id
								i
							}`}
							className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3"
						>
							<p className="whitespace-pre-wrap text-sm text-slate-100">
								{msg.content ?? msg.text ?? JSON.stringify(msg)}
							</p>
						</div>
					))}
				</section>
			) : null}

			{stderrEvents.length > 0 ? (
				<section className="mx-auto mt-6 max-w-3xl space-y-2">
					<p className="text-xs uppercase tracking-[0.15em] text-amber-300">
						Stderr
					</p>
					{stderrEvents.map((evt, i) => (
						<div
							key={`stderr-${
								// biome-ignore lint/suspicious/noArrayIndexKey: streaming events have no stable id
								i
							}`}
							className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2"
						>
							<p className="whitespace-pre-wrap text-xs text-amber-200">
								{evt.content ?? evt.text ?? JSON.stringify(evt)}
							</p>
						</div>
					))}
				</section>
			) : null}

			{events.length > 0 ? (
				<section className="mx-auto mt-6 max-w-3xl">
					<details>
						<summary className="cursor-pointer text-xs text-slate-400">
							Raw Events ({events.length})
						</summary>
						<pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-700 bg-slate-950/90 p-3 text-[11px] text-slate-300">
							{events.map((e) => JSON.stringify(e)).join("\n")}
						</pre>
					</details>
				</section>
			) : null}
		</main>
	);
}
