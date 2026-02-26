"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type FormEvent, useCallback, useMemo, useState } from "react";

type FileEntry = {
	path: string;
	content: string;
};

type CommandEntry = {
	cmd: string;
	args: string;
};

function textFromMessageParts(
	parts: Array<{ type: string; text?: string }>,
): string {
	return parts
		.map((part) => (part.type === "text" ? (part.text ?? "") : ""))
		.join("");
}

function FileEditor({
	files,
	onAdd,
	onRemove,
	onUpdate,
}: {
	files: FileEntry[];
	onAdd: () => void;
	onRemove: (index: number) => void;
	onUpdate: (index: number, file: FileEntry) => void;
}) {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-xs uppercase tracking-[0.15em] text-cyan-300">
					Files to Add
				</p>
				<button
					type="button"
					onClick={onAdd}
					className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
				>
					+ Add File
				</button>
			</div>
			{files.length === 0 ? (
				<p className="text-xs text-slate-500">
					No files. Click &quot;+ Add File&quot; to write files to the sandbox.
				</p>
			) : (
				files.map((file, index) => (
					<div
						key={`file-${
							// biome-ignore lint/suspicious/noArrayIndexKey: stable list with manual add/remove
							index
						}`}
						className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 space-y-2"
					>
						<div className="flex items-center gap-2">
							<input
								value={file.path}
								onChange={(e) =>
									onUpdate(index, { ...file, path: e.target.value })
								}
								placeholder="e.g. data/prompt.txt"
								className="flex-1 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-400"
							/>
							<button
								type="button"
								onClick={() => onRemove(index)}
								className="text-xs text-slate-500 hover:text-rose-300"
							>
								Remove
							</button>
						</div>
						<textarea
							value={file.content}
							onChange={(e) =>
								onUpdate(index, { ...file, content: e.target.value })
							}
							placeholder="File content..."
							rows={3}
							className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-400 font-mono"
						/>
					</div>
				))
			)}
		</div>
	);
}

function CommandEditor({
	commands,
	onAdd,
	onRemove,
	onUpdate,
}: {
	commands: CommandEntry[];
	onAdd: () => void;
	onRemove: (index: number) => void;
	onUpdate: (index: number, command: CommandEntry) => void;
}) {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-xs uppercase tracking-[0.15em] text-cyan-300">
					Commands to Run
				</p>
				<button
					type="button"
					onClick={onAdd}
					className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
				>
					+ Add Command
				</button>
			</div>
			{commands.length === 0 ? (
				<p className="text-xs text-slate-500">
					No commands. Click &quot;+ Add Command&quot; to run commands in the
					sandbox.
				</p>
			) : (
				commands.map((command, index) => (
					<div
						key={`cmd-${
							// biome-ignore lint/suspicious/noArrayIndexKey: stable list with manual add/remove
							index
						}`}
						className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 p-3"
					>
						<input
							value={command.cmd}
							onChange={(e) =>
								onUpdate(index, { ...command, cmd: e.target.value })
							}
							placeholder="e.g. npm"
							className="w-24 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-400 font-mono"
						/>
						<input
							value={command.args}
							onChange={(e) =>
								onUpdate(index, { ...command, args: e.target.value })
							}
							placeholder="e.g. install lodash"
							className="flex-1 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-400 font-mono"
						/>
						<button
							type="button"
							onClick={() => onRemove(index)}
							className="text-xs text-slate-500 hover:text-rose-300"
						>
							Remove
						</button>
					</div>
				))
			)}
		</div>
	);
}

export default function CustomAgentPage() {
	const [input, setInput] = useState("");
	const [files, setFiles] = useState<FileEntry[]>([]);
	const [commands, setCommands] = useState<CommandEntry[]>([]);

	const { status, messages, error, sendMessage } = useChat({
		transport: new DefaultChatTransport({
			api: "/api/custom-agent",
			body: {
				files: files
					.filter((f) => f.path.trim() && f.content.trim())
					.map((f) => ({ path: f.path.trim(), content: f.content })),
				commands: commands
					.filter((c) => c.cmd.trim())
					.map((c) => ({
						cmd: c.cmd.trim(),
						args: c.args
							.trim()
							.split(/\s+/)
							.filter((a) => a),
					})),
			},
		}),
		onError: (chatError) => {
			console.error("Chat error", chatError);
		},
	});

	const isBusy = status === "submitted" || status === "streaming";

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
						{textFromMessageParts(message.parts)}
					</p>
				</div>
			)),
		[messages],
	);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();

			const trimmedMessage = input.trim();
			if (!trimmedMessage || isBusy) {
				return;
			}

			try {
				await sendMessage({ text: trimmedMessage });
				setInput("");
			} catch {
				// Error state is surfaced by useChat.
			}
		},
		[input, isBusy, sendMessage],
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

			<section className="mx-auto max-w-3xl rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-2xl backdrop-blur">
				<p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">
					Custom Agent Demo
				</p>
				<h1 className="mt-2 text-3xl font-semibold">Sandbox Customization</h1>
				<p className="mt-3 text-sm text-slate-300/90">
					Add files and run commands to customize the sandbox before chatting
					with the agent. Files are written and commands are executed via{" "}
					<code className="rounded bg-slate-800 px-1 py-0.5">
						agent.addFiles()
					</code>{" "}
					and{" "}
					<code className="rounded bg-slate-800 px-1 py-0.5">
						agent.runCommands()
					</code>
					, then{" "}
					<code className="rounded bg-slate-800 px-1 py-0.5">
						agent.prepare()
					</code>{" "}
					materializes a new snapshot before the agent runs.
				</p>
			</section>

			<section className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
				<div className="space-y-4">
					<div className="rounded-2xl border border-slate-700 bg-slate-950/90 p-4">
						<FileEditor
							files={files}
							onAdd={() => setFiles([...files, { path: "", content: "" }])}
							onRemove={(index) =>
								setFiles(files.filter((_, i) => i !== index))
							}
							onUpdate={(index, file) =>
								setFiles(files.map((f, i) => (i === index ? file : f)))
							}
						/>
					</div>

					<div className="rounded-2xl border border-slate-700 bg-slate-950/90 p-4">
						<CommandEditor
							commands={commands}
							onAdd={() => setCommands([...commands, { cmd: "", args: "" }])}
							onRemove={(index) =>
								setCommands(commands.filter((_, i) => i !== index))
							}
							onUpdate={(index, command) =>
								setCommands(commands.map((c, i) => (i === index ? command : c)))
							}
						/>
					</div>

					<div className="rounded-2xl border border-slate-700 bg-slate-950/85 p-4">
						<p className="text-xs uppercase tracking-[0.15em] text-slate-400">
							Pending Operations
						</p>
						<pre className="mt-2 overflow-auto text-xs text-slate-200 max-h-40">
							{JSON.stringify(
								{
									files: files
										.filter((f) => f.path.trim())
										.map((f) => ({
											path: f.path.trim(),
											contentLength: f.content.length,
										})),
									commands: commands
										.filter((c) => c.cmd.trim())
										.map((c) => ({
											cmd: c.cmd.trim(),
											args: c.args
												.trim()
												.split(/\s+/)
												.filter((a) => a),
										})),
								},
								null,
								2,
							)}
						</pre>
					</div>
				</div>

				<div className="rounded-2xl border border-slate-700 bg-slate-950/90 p-4">
					<div className="mb-3 flex items-center justify-between">
						<p className="text-xs uppercase tracking-[0.15em] text-cyan-300">
							Chat
						</p>
						<p className="text-[11px] text-slate-400">status: {status}</p>
					</div>

					<div className="max-h-96 space-y-2 overflow-y-auto pr-1">
						{renderedMessages}
					</div>

					{error ? (
						<p className="mt-2 text-xs text-rose-300">{error.message}</p>
					) : null}

					<form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
						<input
							value={input}
							onChange={(event) => setInput(event.target.value)}
							placeholder="e.g. Read the files I added and summarize them"
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
			</section>
		</main>
	);
}
