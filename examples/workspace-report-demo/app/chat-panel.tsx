"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";

type WorkspacePreview = {
	path: string;
	title: string;
	description: string;
	content: string;
};

type Artifact = {
	path: string;
	label: string;
	sizeBytes?: number;
	mimeType?: string;
	messageId: string;
};

const suggestedPrompts = [
	{
		label: "Draft the weekly report",
		prompt:
			"Read the workspace files and create the weekly report plus highlights JSON.",
	},
	{
		label: "Revise for CEO",
		prompt:
			"Update the existing report to make the executive summary tighter and more board-ready.",
	},
	{
		label: "Focus on risk",
		prompt:
			"Revise the report to emphasize churn risk, support issues, and concrete follow-up actions.",
	},
] as const;

function getMessageText(parts: unknown): string {
	if (!Array.isArray(parts)) {
		return "";
	}

	return parts
		.map((part) => {
			if (
				part &&
				typeof part === "object" &&
				"type" in part &&
				part.type === "text" &&
				"text" in part &&
				typeof part.text === "string"
			) {
				return part.text;
			}

			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function isArtifactToolPart(part: unknown): part is {
	type: "dynamic-tool" | "tool-result";
	toolName: string;
	state?: string;
	output?: {
		path?: string;
		size_bytes?: number;
		mime_type?: string;
		label?: string;
	};
	result?: {
		path?: string;
		size_bytes?: number;
		mime_type?: string;
		label?: string;
	};
} {
	if (!part || typeof part !== "object") {
		return false;
	}

	const candidate = part as {
		type?: string;
		toolName?: string;
		state?: string;
		output?: unknown;
		result?: unknown;
	};
	if (candidate.toolName !== "artifact") {
		return false;
	}

	if (candidate.type === "tool-result") {
		return (
			!!candidate.result &&
			typeof candidate.result === "object" &&
			typeof (candidate.result as { path?: string }).path === "string"
		);
	}

	if (candidate.type === "dynamic-tool") {
		return (
			candidate.state === "output-available" &&
			!!candidate.output &&
			typeof candidate.output === "object" &&
			typeof (candidate.output as { path?: string }).path === "string"
		);
	}

	return false;
}

function getArtifactsFromMessages(
	messages: Array<{ id: string; parts?: readonly unknown[] }>,
): Artifact[] {
	return messages.flatMap((message) => {
		if (!Array.isArray(message.parts)) {
			return [];
		}

		return message.parts
			.filter(isArtifactToolPart)
			.map((part) => {
				const artifactData = "output" in part ? part.output : part.result;
				return {
					messageId: message.id,
					path: artifactData?.path ?? "",
					label:
						artifactData?.label ??
						artifactData?.path?.split("/").at(-1) ??
						artifactData?.path ??
						"artifact",
					sizeBytes: artifactData?.size_bytes,
					mimeType: artifactData?.mime_type,
				};
			})
			.filter((artifact) => artifact.path.length > 0);
	});
}

export function ChatPanel({
	workspaceInputPreviews,
}: {
	workspaceInputPreviews: WorkspacePreview[];
}) {
	const [input, setInput] = useState("");
	const [sessionId] = useState(() => crypto.randomUUID());

	const { status, messages, error, sendMessage } = useChat({
		id: sessionId,
		transport: new DefaultChatTransport({
			api: "/chat",
		}),
		onError: (chatError) => {
			console.error("Chat error", chatError);
		},
	});

	const artifacts = useMemo(
		() =>
			Array.from(
				new Map(
					getArtifactsFromMessages(messages).map((artifact) => [
						`${artifact.messageId}:${artifact.path}`,
						artifact,
					]),
				).values(),
			),
		[messages],
	);
	const isBusy = status === "submitted" || status === "streaming";

	async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();

		const trimmed = input.trim();
		if (!trimmed || isBusy) {
			return;
		}

		try {
			await sendMessage({ text: trimmed });
			setInput("");
		} catch {
			// useChat exposes the error state.
		}
	}

	return (
		<>
			<section className="space-y-6">
				<div className="rounded-[32px] border border-white/10 bg-[#0c1520]/88 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.35)] backdrop-blur">
					<p className="text-[11px] uppercase tracking-[0.32em] text-[#7ee9cf]">
						Workspace Report Demo
					</p>
					<h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
						Seed the sandbox with files. Let the agent turn them into artifacts.
					</h1>
					<p className="mt-4 max-w-3xl text-sm leading-7 text-[#98acc2] sm:text-base">
						This demo makes the filesystem flow concrete. The agent starts with
						a real cloud-side workspace, reads seeded files, writes deliverable
						outputs into <code>./artifacts/</code>, and revises those files on
						subsequent turns.
					</p>
					<div className="mt-6 grid gap-3 sm:grid-cols-3">
						<div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
							<p className="text-[11px] uppercase tracking-[0.28em] text-[#7db7ff]">
								Seeded inputs
							</p>
							<p className="mt-2 text-2xl font-semibold text-white">4 files</p>
						</div>
						<div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
							<p className="text-[11px] uppercase tracking-[0.28em] text-[#7db7ff]">
								Discovered artifacts
							</p>
							<p className="mt-2 text-2xl font-semibold text-white">
								{artifacts.length}
							</p>
						</div>
						<div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
							<p className="text-[11px] uppercase tracking-[0.28em] text-[#7db7ff]">
								Runtime
							</p>
							<p className="mt-2 text-2xl font-semibold text-white">{status}</p>
						</div>
					</div>
				</div>

				<div className="rounded-[32px] border border-white/10 bg-[#0b121c]/84 p-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<p className="text-[11px] uppercase tracking-[0.32em] text-[#7db7ff]">
								Workspace seed
							</p>
							<h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
								Files present before the first message
							</h2>
						</div>
						<p className="max-w-xl text-sm leading-6 text-[#8ea2b8]">
							These files live in the repo and are copied into the sandbox
							snapshot via <code>{"defineAgent({ files })"}</code>.
						</p>
					</div>
					<div className="mt-6 space-y-4">
						{workspaceInputPreviews.map((file) => (
							<article
								key={file.path}
								className="rounded-[24px] border border-white/8 bg-[#0f1824] p-5"
							>
								<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<h3 className="text-lg font-medium text-white">
											{file.title}
										</h3>
										<p className="mt-1 text-sm text-[#90a5bb]">
											{file.description}
										</p>
									</div>
									<code className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#d8e6f8]">
										{file.path}
									</code>
								</div>
								<pre className="mt-4 overflow-x-auto rounded-[20px] border border-white/8 bg-[#09111a] p-4 text-sm leading-6 text-[#d9e4f2]">
									{file.content}
								</pre>
							</article>
						))}
					</div>
				</div>
			</section>

			<section className="space-y-6">
				<div className="rounded-[32px] border border-white/10 bg-[#0c1520]/88 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.28)] backdrop-blur">
					<p className="text-[11px] uppercase tracking-[0.32em] text-[#7ee9cf]">
						Agent console
					</p>
					<h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
						Ask for the report, then ask for a revision
					</h2>
					<p className="mt-3 text-sm leading-6 text-[#8ea2b8]">
						A good second prompt is a revision request. That demonstrates that
						the agent is working against a persistent workspace, not a blank
						chat context every turn.
					</p>
					<div className="mt-5 flex flex-wrap gap-2">
						{suggestedPrompts.map((item) => (
							<button
								key={item.label}
								type="button"
								onClick={() => setInput(item.prompt)}
								className="rounded-full border border-[#7db7ff]/24 bg-[#101f31] px-3 py-2 text-xs text-[#d9e7f8] transition hover:border-[#7db7ff]/55 hover:bg-[#13263b]"
							>
								{item.label}
							</button>
						))}
					</div>
					<form onSubmit={handleSubmit} className="mt-5 space-y-3">
						<textarea
							value={input}
							onChange={(event) => setInput(event.target.value)}
							placeholder="Read the workspace files and create the report artifacts."
							className="min-h-32 w-full rounded-[24px] border border-white/10 bg-[#09111a] px-4 py-4 text-sm leading-6 text-white outline-none transition focus:border-[#7db7ff]/55"
						/>
						<div className="flex items-center justify-between gap-3">
							<p className="text-xs text-[#7f93aa]">
								The agent should write user-facing outputs to
								<code>./artifacts/</code> and mention discovered file paths.
							</p>
							<button
								type="submit"
								disabled={isBusy}
								className="rounded-full bg-[#7ee9cf] px-4 py-2 text-sm font-medium text-[#07111b] transition hover:bg-[#9ef1db] disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isBusy ? "Working..." : "Send"}
							</button>
						</div>
					</form>
					<div className="mt-6 space-y-3">
						{messages.length === 0 ? (
							<div className="rounded-[24px] border border-dashed border-white/10 bg-white/3 p-5 text-sm leading-6 text-[#8ea2b8]">
								No messages yet. Start with "Draft the weekly report" to make
								the filesystem workflow visible.
							</div>
						) : null}
						{messages.map((message) => {
							const text = getMessageText(message.parts);

							return (
								<div
									key={message.id}
									className={`rounded-[24px] border p-4 ${
										message.role === "user"
											? "border-[#7db7ff]/18 bg-[#102036]"
											: "border-white/10 bg-[#0a111a]"
									}`}
								>
									<p className="text-[11px] uppercase tracking-[0.28em] text-[#7db7ff]">
										{message.role}
									</p>
									<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#e5eef8]">
										{text || "No text content"}
									</p>
								</div>
							);
						})}
						{artifacts.length > 0 ? (
							<div className="rounded-[24px] border border-[#7db7ff]/20 bg-[#102036] p-4">
								<p className="text-[11px] uppercase tracking-[0.28em] text-[#7db7ff]">
									Discovered artifacts
								</p>
								<div className="mt-4 space-y-3">
									{artifacts.map((artifact) => {
										const fileName =
											artifact.path.split("/").at(-1) ?? artifact.path;

										return (
											<article
												key={`${artifact.messageId}:${artifact.path}`}
												className="rounded-[20px] border border-white/8 bg-[#0f1824] p-4"
											>
												<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
													<div>
														<p className="text-sm font-medium text-white">
															{artifact.label}
														</p>
														<p className="mt-1 text-xs text-[#7f95ad]">
															{artifact.sizeBytes === undefined
																? "Size unknown"
																: `${artifact.sizeBytes.toLocaleString()} bytes`}
															{artifact.mimeType
																? ` • ${artifact.mimeType}`
																: ""}
														</p>
													</div>
													<a
														href={`/agent-api/files?chat_id=${encodeURIComponent(
															sessionId,
														)}&path=${encodeURIComponent(
															artifact.path,
														)}&download=1`}
														className="rounded-full border border-[#7db7ff]/24 bg-[#101f31] px-3 py-2 text-xs text-[#d9e7f8] transition hover:border-[#7db7ff]/55 hover:bg-[#13263b]"
													>
														Download {fileName}
													</a>
												</div>
											</article>
										);
									})}
								</div>
							</div>
						) : null}
						{error ? (
							<div className="rounded-[24px] border border-[#ff7a7a]/20 bg-[#321416] p-4 text-sm leading-6 text-[#ffc9c9]">
								{error.message}
							</div>
						) : null}
					</div>
				</div>

				<div className="rounded-[32px] border border-white/10 bg-[#0b121c]/84 p-6">
					<p className="text-[11px] uppercase tracking-[0.32em] text-[#7db7ff]">
						Session outputs
					</p>
					<h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
						Artifact links come from runtime-discovered events
					</h2>
					<p className="mt-3 text-sm leading-6 text-[#8ea2b8]">
						Files written to <code>./artifacts/</code> are exposed via the Agent
						API download endpoint using this chat session ID.
					</p>
				</div>
			</section>
		</>
	);
}
