"use client";

import { useState } from "react";

type SurfaceTab = {
	label: string;
	kicker: string;
	title: string;
	description: string;
	noteLabel: string;
	noteTitle: string;
	noteBody: string;
	code?: string;
};

const surfaceTabs: SurfaceTab[] = [
	{
		label: "Inbox-style agent console",
		kicker: "Chat-native UX",
		title: "An agent surface that feels like a product, not a prompt box.",
		description:
			"Placeholder for a short product clip showing requests, in-flight work, and completed outcomes in one chat-native surface.",
		noteLabel: "Why it works",
		noteTitle: "AI SDK keeps the surface simple.",
		noteBody:
			"The inbox-style app is built on AI SDK chat primitives, so it can stay close to a simple message stream instead of inventing a custom transport. Giselle Sandbox Agent API and the Giselle Provider make the agent available through that same AI SDK protocol.",
	},
	{
		label: "Return UI, not just text",
		kicker: "Structured output",
		title: "Charts, steps, and task state can arrive as part of the response.",
		description:
			"Placeholder for a screenshot of charts, callouts, task progress, or other structured UI rendered directly in the app.",
		noteLabel: "Why it works",
		noteTitle: "json-render makes UI schema-first.",
		noteBody:
			"Giselle Sandbox Agent supports json-render catalogs, so the agent can emit schema-first UI that the app renders directly. Because the same stream can carry both text and structured specs, the experience stays seamless instead of splitting UI and prose apart.",
	},
	{
		label: "Automate the app you already built",
		kicker: "Product-embedded automation",
		title:
			"Add agent control points to your own UI and keep the boundaries in code.",
		description:
			"Placeholder for a clip showing a real product form or internal tool being driven through stable browser-tool ids.",
		code: `<input
  data-browser-tool-id="expense-amount"
  value={amount}
  onChange={...}
/>

const browserTool = useBrowserToolHandler();

const chat = useChat({
  ...browserTool,
  transport: new DefaultChatTransport({ api: "/chat" }),
});`,
		noteLabel: "Why it works",
		noteTitle: "We added the browser interface the CLIs were missing.",
		noteBody:
			"Codex CLI and Gemini CLI do not natively expose an AI SDK-style interface for interactive browser control. The browser-tool bridge fills that gap by turning browser interaction into a request/response tool protocol, which recreates an interactive loop while keeping the controlled surface explicit in product code.",
	},
	{
		label: "Use the same agent from web chat or Slack",
		kicker: "Shared runtime",
		title: "One runtime, multiple surfaces, consistent task flow.",
		description:
			"Placeholder for a split-screen showing the same agent handling a task from the app and from Slack.",
		noteLabel: "Why it works",
		noteTitle: "Chat SDK gives Slack the same runtime shape.",
		noteBody:
			"The web app and Slack entrypoint both feed conversation history into the same agent runtime. On the Slack side, Chat SDK and the Slack adapter handle webhook delivery and thread state, so the agent can behave like one system even when the surface changes.",
	},
];

function Placeholder({
	label,
	title,
	description,
}: {
	label: string;
	title: string;
	description: string;
}) {
	return (
		<div className="placeholder-frame panel-strong rounded-[28px] p-5">
			<div className="relative z-10 flex h-full min-h-[260px] flex-col justify-between rounded-[22px] border border-white/8 bg-black/20 p-5">
				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#8df6c9]">
						{label}
					</p>
					<h3 className="mt-3 text-2xl tracking-tight text-white">{title}</h3>
				</div>
				<p className="max-w-md text-sm leading-6 text-muted">{description}</p>
			</div>
		</div>
	);
}

export function SurfaceTabs() {
	const [activeIndex, setActiveIndex] = useState(0);
	const activeTab = surfaceTabs[activeIndex];

	return (
		<div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
			<div className="panel rounded-[28px] p-3">
				<div className="space-y-2">
					{surfaceTabs.map((tab, index) => (
						<button
							key={tab.label}
							type="button"
							onClick={() => setActiveIndex(index)}
							className={`block w-full rounded-[22px] border px-5 py-4 text-left transition ${
								index === activeIndex
									? "border-[#8df6c9]/30 bg-[#102036]"
									: "border-white/8 bg-white/3 hover:border-[#84b8ff]/30 hover:bg-white/5"
							}`}
						>
							<p className="text-base tracking-tight text-white sm:text-lg">
								{tab.label}
							</p>
						</button>
					))}
				</div>
			</div>
			<div className="space-y-6">
				<Placeholder
					label={activeTab.kicker}
					title={activeTab.title}
					description={activeTab.description}
				/>
				<div className="panel-strong rounded-[28px] p-5">
					<div className="rounded-[22px] border border-white/8 bg-[#07111b]/90 p-5">
						<div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
							<div>
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#8df6c9]">
									{activeTab.noteLabel}
								</p>
								<h3 className="mt-3 text-2xl tracking-tight text-white">
									{activeTab.noteTitle}
								</h3>
							</div>
							{activeTab.code ? (
								<div className="rounded-full border border-[#84b8ff]/30 bg-[#102036] px-3 py-1 text-xs text-[#dceaff]">
									no extension required
								</div>
							) : null}
						</div>
						{activeTab.code ? (
							<div className="mt-5 rounded-[20px] border border-white/8 bg-black/30 p-4">
								<pre className="overflow-x-auto text-sm leading-6 text-[#d7e5fb]">
									<code>{activeTab.code}</code>
								</pre>
							</div>
						) : null}
						<p className="mt-5 max-w-2xl text-sm leading-6 text-muted">
							{activeTab.noteBody}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
