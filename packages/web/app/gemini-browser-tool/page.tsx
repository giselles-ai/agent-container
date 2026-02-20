"use client";

import { browserTool } from "@giselles-ai/browser-tool/react";
import { useAgent } from "@giselles-ai/sandbox-agent/react";
import { type FormEvent, useCallback, useMemo, useState } from "react";

function DemoForm() {
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [category, setCategory] = useState("memo");
	const [publish, setPublish] = useState(false);

	return (
		<div className="mx-auto max-w-3xl rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-2xl backdrop-blur">
			<p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">
				Gemini Browser Tool Agent
			</p>
			<h1 className="mt-2 text-3xl font-semibold">Form Autofill Prototype</h1>
			<p className="mt-3 text-sm text-slate-300/90">
				This page uses Gemini CLI + MCP + SSE agent runner for browser-side DOM
				execution.
			</p>

			<form
				className="mt-8 space-y-5"
				onSubmit={(event) => event.preventDefault()}
			>
				<div>
					<label
						htmlFor="title"
						className="mb-2 block text-sm font-medium text-slate-100"
					>
						Title
					</label>
					<input
						id="title"
						name="title"
						data-browser-tool-id="title"
						type="text"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="Enter title"
						className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
					/>
				</div>

				<div>
					<label
						htmlFor="body"
						className="mb-2 block text-sm font-medium text-slate-100"
					>
						Body
					</label>
					<textarea
						id="body"
						name="body"
						data-browser-tool-id="body"
						value={body}
						onChange={(event) => setBody(event.target.value)}
						placeholder="Enter body"
						rows={8}
						className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
					/>
				</div>

				<div>
					<label
						htmlFor="category"
						className="mb-2 block text-sm font-medium text-slate-100"
					>
						Category
					</label>
					<select
						id="category"
						name="category"
						data-browser-tool-id="category"
						value={category}
						onChange={(event) => setCategory(event.target.value)}
						className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
					>
						<option value="memo">Memo</option>
						<option value="blog">Blog Post</option>
						<option value="report">Report</option>
					</select>
				</div>

				<label className="flex items-center gap-2 text-sm text-slate-200">
					<input
						type="checkbox"
						name="publish"
						data-browser-tool-id="publish"
						checked={publish}
						onChange={(event) => setPublish(event.target.checked)}
						className="h-4 w-4 rounded border-slate-500 bg-slate-950 text-cyan-400"
					/>
					Publish immediately
				</label>
			</form>

			<div className="mt-8 rounded-xl border border-slate-700/80 bg-slate-950/70 p-4">
				<p className="text-xs uppercase tracking-[0.16em] text-slate-400">
					Current State
				</p>
				<pre className="mt-2 overflow-auto text-xs text-slate-200">
					{JSON.stringify({ title, body, category, publish }, null, 2)}
				</pre>
			</div>
		</div>
	);
}

export default function GeminiBrowserToolPage() {
	const [input, setInput] = useState("");
	const [documentText, setDocumentText] = useState("");

	const {
		status,
		messages,
		tools,
		warnings,
		stderrLogs,
		sandboxId,
		geminiSessionId,
		error,
		sendMessage,
	} = useAgent({
		endpoint: "/agent-api/run",
		tools: {
			browserTool: browserTool(),
		},
	});

	const renderedMessages = useMemo(
		() =>
			messages.map((message) => (
				<div
					key={message.id}
					className={`rounded-lg border p-3 ${
						message.role === "user"
							? "border-slate-700 bg-slate-900/80"
							: "border-emerald-500/40 bg-emerald-500/10"
					}`}
				>
					<p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
						{message.role}
					</p>
					<p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">
						{message.content}
					</p>
				</div>
			)),
		[messages],
	);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();

			const trimmed = input.trim();
			if (!trimmed || status === "running") {
				return;
			}

			try {
				await sendMessage({
					message: trimmed,
					document: documentText.trim() ? documentText.trim() : undefined,
				});
				setInput("");
			} catch {
				// Error message is managed by useAgent.
			}
		},
		[documentText, input, sendMessage, status],
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
				<span>sandbox: {sandboxId ?? "-"}</span>
				<span>session: {geminiSessionId ?? "-"}</span>
			</div>

			<DemoForm />

			<section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
				<div className="rounded-2xl border border-slate-700 bg-slate-950/90 p-4">
					<div className="mb-3 flex items-center justify-between">
						<p className="text-xs uppercase tracking-[0.15em] text-cyan-300">
							Gemini Browser Tool Chat
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

					{error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

					<form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
						<input
							value={input}
							onChange={(event) => setInput(event.target.value)}
							placeholder="e.g. Fill title and body with a concise summary"
							className="flex-1 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
						/>
						<button
							type="submit"
							disabled={!input.trim() || status === "running"}
							className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{status === "running" ? "Running..." : "Send"}
						</button>
					</form>
				</div>

				<aside className="space-y-4">
					<div className="rounded-2xl border border-slate-700 bg-slate-950/85 p-4">
						<p className="text-sm font-medium text-slate-100">Tool Calls</p>
						<div className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-slate-200">
							{tools.length === 0 ? (
								<p className="text-slate-500">No tool calls yet.</p>
							) : (
								tools.map((tool) => (
									<div
										key={tool.id}
										className="rounded-lg border border-slate-700 bg-slate-900/70 p-2"
									>
										<p className="font-medium text-slate-100">
											{tool.toolName}
										</p>
										<p className="mt-1 text-slate-400">id: {tool.toolId}</p>
										<p className="mt-1 text-slate-400">
											status: {tool.status ?? "pending"}
										</p>
										<details className="mt-2">
											<summary className="cursor-pointer text-slate-400">
												details
											</summary>
											<pre className="mt-1 whitespace-pre-wrap text-[11px] text-slate-300">
												{JSON.stringify(
													{ parameters: tool.parameters, output: tool.output },
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
								{warnings.map((warning, index) => (
									<li
										key={`${warning}-${
											// biome-ignore lint/suspicious/noArrayIndexKey: wip
											index
										}`}
									>
										- {warning}
									</li>
								))}
							</ul>
						)}
					</div>

					<div className="rounded-2xl border border-slate-700 bg-slate-950/85 p-4">
						<p className="text-sm font-medium text-slate-100">stderr</p>
						<div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-rose-200">
							{stderrLogs.length === 0 ? (
								<p className="text-slate-500">No stderr logs.</p>
							) : (
								stderrLogs.map((line, index) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only
									<p key={index} className="whitespace-pre-wrap">
										{line}
									</p>
								))
							)}
						</div>
					</div>
				</aside>
			</section>
		</main>
	);
}
