"use client";

import { code } from "@streamdown/code";
import { type ReactNode, useMemo } from "react";
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

const DEFAULT_COLORS = [
	"#6366f1",
	"#22d3ee",
	"#f59e0b",
	"#ef4444",
	"#10b981",
	"#a855f7",
	"#f97316",
	"#ec4899",
];

type ChartProps = Record<string, unknown> & { children?: ReactNode };

function parseChartData(props: ChartProps) {
	const labels = ((props["data-labels"] as string) ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const title = (props["data-title"] as string) ?? "";
	const customColors = ((props["data-colors"] as string) ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const colors =
		customColors.length > 0
			? customColors
			: DEFAULT_COLORS.slice(0, labels.length);

	const series: { name: string; values: number[] }[] = [];

	const singleValues = (props["data-values"] as string) ?? "";
	if (singleValues) {
		series.push({
			name: "",
			values: singleValues.split(",").map((s) => Number(s.trim())),
		});
	}

	for (let i = 1; i <= 10; i++) {
		const vals = props[`data-values-${i}`] as string | undefined;
		const name = (props[`data-series-${i}`] as string) ?? `Series ${i}`;
		if (vals) {
			series.push({
				name,
				values: vals.split(",").map((s) => Number(s.trim())),
			});
		}
	}

	return { labels, title, colors, series };
}

function BarChart(props: ChartProps) {
	const { labels, title, colors, series } = useMemo(
		() => parseChartData(props),
		[props],
	);
	if (labels.length === 0 || series.length === 0) return null;

	const allValues = series.flatMap((s) => s.values);
	const max = Math.max(...allValues, 1);
	const isMulti = series.length > 1;

	return (
		<span className="my-4 block rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
			{title && (
				<span className="mb-3 block text-center text-sm font-medium text-gray-200">
					{title}
				</span>
			)}
			{isMulti && (
				<span className="mb-2 flex flex-wrap justify-center gap-3">
					{series.map((s, i) => (
						<span
							key={s.name}
							className="inline-flex items-center gap-1 text-xs text-gray-300"
						>
							<span
								className="inline-block h-2.5 w-2.5 rounded-sm"
								style={{ backgroundColor: colors[i % colors.length] }}
							/>
							{s.name}
						</span>
					))}
				</span>
			)}
			<span className="flex items-end gap-1" style={{ height: "160px" }}>
				{labels.map((label, li) => (
					<span key={label} className="flex flex-1 flex-col items-center gap-1">
						<span
							className="flex w-full items-end justify-center gap-0.5"
							style={{ height: "140px" }}
						>
							{series.map((s, si) => {
								const val = s.values[li] ?? 0;
								const pct = (val / max) * 100;
								return (
									<span
										key={s.name}
										className="relative flex-1 rounded-t transition-all"
										style={{
											height: `${pct}%`,
											minHeight: val > 0 ? "4px" : "0",
											backgroundColor: colors[si % colors.length],
											maxWidth: isMulti ? "24px" : "48px",
										}}
										title={`${label}: ${val}`}
									/>
								);
							})}
						</span>
						<span
							className="block truncate text-center text-xs text-gray-400"
							style={{ maxWidth: "60px" }}
						>
							{label}
						</span>
					</span>
				))}
			</span>
		</span>
	);
}

function LineChart(props: ChartProps) {
	const { labels, title, colors, series } = useMemo(
		() => parseChartData(props),
		[props],
	);
	if (labels.length === 0 || series.length === 0) return null;

	const allValues = series.flatMap((s) => s.values);
	const min = Math.min(...allValues);
	const max = Math.max(...allValues);
	const range = max - min || 1;

	const w = 400;
	const h = 160;
	const px = 8;
	const py = 8;
	const plotW = w - px * 2;
	const plotH = h - py * 2;

	const isMulti = series.length > 1;

	return (
		<span className="my-4 block rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
			{title && (
				<span className="mb-3 block text-center text-sm font-medium text-gray-200">
					{title}
				</span>
			)}
			{isMulti && (
				<span className="mb-2 flex flex-wrap justify-center gap-3">
					{series.map((s, i) => (
						<span
							key={s.name}
							className="inline-flex items-center gap-1 text-xs text-gray-300"
						>
							<span
								className="inline-block h-2.5 w-2.5 rounded-sm"
								style={{ backgroundColor: colors[i % colors.length] }}
							/>
							{s.name}
						</span>
					))}
				</span>
			)}
			<svg
				viewBox={`0 0 ${w} ${h}`}
				className="w-full"
				style={{ maxHeight: "200px" }}
			>
				<title>{title ?? "Line chart"}</title>
				{series.map((s, si) => {
					const points = s.values
						.map((v, i) => {
							const x = px + (i / (labels.length - 1 || 1)) * plotW;
							const y = py + plotH - ((v - min) / range) * plotH;
							return `${x},${y}`;
						})
						.join(" ");
					return (
						<polyline
							key={s.name}
							fill="none"
							stroke={colors[si % colors.length]}
							strokeWidth="2.5"
							strokeLinejoin="round"
							strokeLinecap="round"
							points={points}
						/>
					);
				})}
				{labels.map((label, i) => {
					const x = px + (i / (labels.length - 1 || 1)) * plotW;
					return (
						<text
							key={label}
							x={x}
							y={h - 1}
							textAnchor="middle"
							className="fill-gray-400"
							fontSize="10"
						>
							{label}
						</text>
					);
				})}
				{series.map((s, si) =>
					s.values.map((v, i) => {
						const x = px + (i / (labels.length - 1 || 1)) * plotW;
						const y = py + plotH - ((v - min) / range) * plotH;
						return (
							<circle
								key={`${s.name}-${labels[i]}`}
								cx={x}
								cy={y}
								r="3.5"
								fill={colors[si % colors.length]}
							>
								<title>{`${labels[i]}: ${v}`}</title>
							</circle>
						);
					}),
				)}
			</svg>
		</span>
	);
}

function PieChart(props: ChartProps) {
	const { labels, title, colors, series } = useMemo(
		() => parseChartData(props),
		[props],
	);
	const values = series[0]?.values ?? [];
	if (labels.length === 0 || values.length === 0) return null;

	const total = values.reduce((a, b) => a + b, 0) || 1;
	const size = 160;
	const cx = size / 2;
	const cy = size / 2;
	const r = 60;

	let cumAngle = -Math.PI / 2;
	const slices = values.map((v, i) => {
		const angle = (v / total) * 2 * Math.PI;
		const startX = cx + r * Math.cos(cumAngle);
		const startY = cy + r * Math.sin(cumAngle);
		const endX = cx + r * Math.cos(cumAngle + angle);
		const endY = cy + r * Math.sin(cumAngle + angle);
		const largeArc = angle > Math.PI ? 1 : 0;
		const d = `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`;
		cumAngle += angle;
		return { d, color: colors[i % colors.length], label: labels[i], value: v };
	});

	return (
		<span className="my-4 block rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
			{title && (
				<span className="mb-3 block text-center text-sm font-medium text-gray-200">
					{title}
				</span>
			)}
			<span className="flex flex-wrap items-center justify-center gap-6">
				<svg
					viewBox={`0 0 ${size} ${size}`}
					style={{ width: "160px", height: "160px" }}
				>
					<title>{title ?? "Pie chart"}</title>
					{slices.map((s) => (
						<path
							key={s.label}
							d={s.d}
							fill={s.color}
							stroke="#1f2937"
							strokeWidth="1.5"
						>
							<title>{`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}</title>
						</path>
					))}
				</svg>
				<span className="flex flex-col gap-1.5">
					{slices.map((s) => (
						<span
							key={s.label}
							className="inline-flex items-center gap-2 text-xs text-gray-300"
						>
							<span
								className="inline-block h-2.5 w-2.5 rounded-sm"
								style={{ backgroundColor: s.color }}
							/>
							{s.label} ({Math.round((s.value / total) * 100)}%)
						</span>
					))}
				</span>
			</span>
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
				"bar-chart": ["data*"],
				"line-chart": ["data*"],
				"pie-chart": ["data*"],
			}}
			components={{
				step: StepIndicator,
				callout: Callout,
				"bar-chart": BarChart,
				"line-chart": LineChart,
				"pie-chart": PieChart,
			}}
			isAnimating={isStreaming}
		>
			{text}
		</Streamdown>
	);
}
