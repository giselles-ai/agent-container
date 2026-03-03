"use client";

import { useState } from "react";

type DiffLine = {
	type: "added" | "removed" | "context";
	text: string;
};

type Tab = {
	filename: string;
	lines: DiffLine[];
};

const tabs: Tab[] = [
	{
		filename: "api/chat/route.ts",
		lines: [
			{ type: "added", text: '+import { giselle } from "@giselles-ai/giselle-provider";' },
			{ type: "context", text: ' import { streamText } from "ai";' },
			{ type: "context", text: " " },
			{ type: "context", text: " const result = streamText({" },
			{ type: "removed", text: '-   model: openai("gpt-5.2-codex"),' },
			{ type: "added", text: '+   model: giselle({ agent: "codex-cli" }),' },
			{ type: "context", text: "    messages," },
			{ type: "context", text: " });" },
		],
	},
	{
		filename: "app/page.tsx",
		lines: [
			{ type: "added", text: '+import { useBrowserToolHandler } from "@giselles-ai/browser-tool/react";' },
			{ type: "context", text: ' import { useChat } from "@ai-sdk/react";' },
			{ type: "context", text: " " },
			{ type: "added", text: "+ const browserTool = useBrowserToolHandler();" },
			{ type: "context", text: "  const { addToolOutput, ...chat } = useChat({" },
			{ type: "removed", text: "-   onToolCall: async ({ toolCall }) => { /* 80 lines */ }," },
			{ type: "added", text: "+   ...browserTool," },
			{ type: "context", text: "  });" },
			{ type: "added", text: "+ browserTool.connect(addToolOutput);" },
		],
	},
];

const lineStyles = {
	added: "bg-emerald-500/10 px-6 text-emerald-400",
	removed: "bg-red-500/10 px-6 text-red-400/70",
	context: "px-6 text-slate-500",
} as const;

export function CodeDiffTabs() {
	const [active, setActive] = useState(0);

	return (
		<div className="mt-8 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 font-mono text-sm leading-relaxed whitespace-pre">
			<div className="flex border-b border-slate-800/60">
				{tabs.map((tab, i) => (
					<button
						key={tab.filename}
						type="button"
						onClick={() => setActive(i)}
						className={`px-6 py-2.5 text-xs transition ${
							i === active
								? "border-b border-slate-100 text-slate-200"
								: "text-slate-500 hover:text-slate-400"
						}`}
					>
						{tab.filename}
					</button>
				))}
			</div>
			<div className="overflow-x-auto py-4">
				{tabs[active].lines.map((line, i) => (
					<div
						key={`${tabs[active].filename}-${
							// biome-ignore lint/suspicious/noArrayIndexKey: static content
							i
						}`}
						className={lineStyles[line.type]}
					>
						{line.text}
					</div>
				))}
			</div>
		</div>
	);
}
