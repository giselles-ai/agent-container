"use client";

import { code } from "@streamdown/code";
import type { PluginConfig } from "streamdown";
import { Streamdown } from "streamdown";

export function ToolInvocationDisplay({
	toolName,
	input,
	state,
}: {
	toolName: string;
	input: Record<string, unknown>;
	state: string;
	output: unknown;
}) {
	const done = state === "output-available";
	const error = state === "output-error";

	const detail =
		typeof input.command === "string"
			? input.command
			: Object.values(input).find((v) => typeof v === "string");

	return (
		<div className="flex items-center gap-2 py-0.5 font-mono text-sm text-gray-400">
			<span
				className={
					error
						? "text-red-400"
						: done
							? "text-green-400"
							: "animate-pulse text-yellow-400"
				}
			>
				{error ? "✕" : done ? "✓" : "●"}
			</span>
			<span className="font-semibold text-gray-300">{toolName}</span>
			{detail && (
				<span className="truncate text-gray-500">{String(detail)}</span>
			)}
		</div>
	);
}

export function ChatMessage({
	id,
	text,
	isStreaming,
}: {
	id: string;
	text: string;
	isStreaming: boolean;
}) {
	return (
		<Streamdown
			key={id}
			plugins={{ code } as PluginConfig}
			isAnimating={isStreaming}
		>
			{text}
		</Streamdown>
	);
}
