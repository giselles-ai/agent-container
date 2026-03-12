"use client";

import { code } from "@streamdown/code";
import type { ReactNode } from "react";
import type { PluginConfig } from "streamdown";
import { Streamdown } from "streamdown";

function StepIndicator({
	status,
	children,
}: Record<string, unknown> & { status?: string; children?: ReactNode }) {
	const icons: Record<string, string> = {
		done: "✅",
		current: "🔄",
		pending: "⏳",
	};
	const styles: Record<string, string> = {
		done: "border-green-500/30 bg-green-500/10 text-green-300",
		current: "border-blue-500/30 bg-blue-500/10 text-blue-300 animate-pulse",
		pending: "border-gray-600/30 bg-gray-600/10 text-gray-400",
	};
	const s = status ?? "pending";
	return (
		<span
			className={`my-2 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${styles[s] ?? styles.pending}`}
		>
			<span>{icons[s] ?? icons.pending}</span>
			<span>{children}</span>
		</span>
	);
}

function Callout({
	type,
	children,
}: Record<string, unknown> & { type?: string; children?: ReactNode }) {
	const config: Record<string, { icon: string; style: string }> = {
		tip: {
			icon: "💡",
			style: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
		},
		warn: {
			icon: "⚠️",
			style: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
		},
		info: {
			icon: "ℹ️",
			style: "border-sky-500/40 bg-sky-500/10 text-sky-200",
		},
	};
	const c = config[type ?? "info"] ?? config.info;
	return (
		<span
			className={`my-3 inline-flex items-start gap-2 rounded-lg border-l-4 px-4 py-3 text-sm ${c.style}`}
		>
			<span>{c.icon}</span>
			<span>{children}</span>
		</span>
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
			allowedTags={{
				step: ["status"],
				callout: ["type"],
			}}
			components={{
				step: StepIndicator,
				callout: Callout,
			}}
			isAnimating={isStreaming}
		>
			{text}
		</Streamdown>
	);
}
