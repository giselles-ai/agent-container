"use client";

import { defineRegistry } from "@json-render/react";
import { catalog } from "./catalog";

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

function normalizeLabels(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function normalizeSeries(
	value: unknown,
): Array<{ name: string; values: number[] }> {
	if (!Array.isArray(value)) return [];
	return value
		.map((item, index) => {
			if (!item || typeof item !== "object") return null;
			const record = item as Record<string, unknown>;
			const values = Array.isArray(record.values)
				? record.values.filter(
						(entry): entry is number => typeof entry === "number",
					)
				: [];
			return {
				name:
					typeof record.name === "string" && record.name.length > 0
						? record.name
						: `Series ${index + 1}`,
				values,
			};
		})
		.filter(
			(item): item is { name: string; values: number[] } => item !== null,
		);
}

function normalizeValues(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is number => typeof item === "number");
}

export const { registry } = defineRegistry(catalog, {
	components: {
		BarChart: ({ props }) => {
			const title = typeof props.title === "string" ? props.title : null;
			const labels = normalizeLabels(props.labels);
			const series = normalizeSeries(props.series);
			if (!labels?.length || !series?.length) return null;
			const allValues = series.flatMap((s) => s.values);
			const max = Math.max(...allValues, 1);
			const isMulti = series.length > 1;

			return (
				<div className="my-4 rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
					{title && (
						<div className="mb-3 text-center text-sm font-medium text-gray-200">
							{title}
						</div>
					)}
					{isMulti && (
						<div className="mb-2 flex flex-wrap justify-center gap-3">
							{series.map((s, i) => (
								<span
									key={s.name}
									className="inline-flex items-center gap-1 text-xs text-gray-300"
								>
									<span
										className="inline-block h-2.5 w-2.5 rounded-sm"
										style={{
											backgroundColor:
												DEFAULT_COLORS[i % DEFAULT_COLORS.length],
										}}
									/>
									{s.name}
								</span>
							))}
						</div>
					)}
					<div className="flex items-end gap-1" style={{ height: "160px" }}>
						{labels.map((label, li) => (
							<div
								key={label}
								className="flex flex-1 flex-col items-center gap-1"
							>
								<div
									className="flex w-full items-end justify-center gap-0.5"
									style={{ height: "140px" }}
								>
									{series.map((s, si) => {
										const val = s.values[li] ?? 0;
										const pct = (val / max) * 100;
										return (
											<div
												key={s.name}
												className="relative flex-1 rounded-t transition-all"
												style={{
													height: `${pct}%`,
													minHeight: val > 0 ? "4px" : "0",
													backgroundColor:
														DEFAULT_COLORS[si % DEFAULT_COLORS.length],
													maxWidth: isMulti ? "24px" : "48px",
												}}
												title={`${label}: ${val}`}
											/>
										);
									})}
								</div>
								<span
									className="block truncate text-center text-xs text-gray-400"
									style={{ maxWidth: "60px" }}
								>
									{label}
								</span>
							</div>
						))}
					</div>
				</div>
			);
		},

		LineChart: ({ props }) => {
			const title = typeof props.title === "string" ? props.title : null;
			const labels = normalizeLabels(props.labels);
			const series = normalizeSeries(props.series);
			if (!labels.length || !series.length) return null;
			const allValues = series.flatMap((s) => s.values);
			const min = Math.min(...allValues);
			const max = Math.max(...allValues);
			const range = max - min || 1;
			const w = 400,
				h = 160,
				px = 8,
				py = 8;
			const plotW = w - px * 2,
				plotH = h - py * 2;
			const isMulti = series.length > 1;

			return (
				<div className="my-4 rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
					{title && (
						<div className="mb-3 text-center text-sm font-medium text-gray-200">
							{title}
						</div>
					)}
					{isMulti && (
						<div className="mb-2 flex flex-wrap justify-center gap-3">
							{series.map((s, i) => (
								<span
									key={s.name}
									className="inline-flex items-center gap-1 text-xs text-gray-300"
								>
									<span
										className="inline-block h-2.5 w-2.5 rounded-sm"
										style={{
											backgroundColor:
												DEFAULT_COLORS[i % DEFAULT_COLORS.length],
										}}
									/>
									{s.name}
								</span>
							))}
						</div>
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
									stroke={DEFAULT_COLORS[si % DEFAULT_COLORS.length]}
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
										fill={DEFAULT_COLORS[si % DEFAULT_COLORS.length]}
									>
										<title>{`${labels[i]}: ${v}`}</title>
									</circle>
								);
							}),
						)}
					</svg>
				</div>
			);
		},

		PieChart: ({ props }) => {
			const title = typeof props.title === "string" ? props.title : null;
			const labels = normalizeLabels(props.labels);
			const values = normalizeValues(props.values);
			if (!labels.length || !values.length) return null;
			const total = values.reduce((a, b) => a + b, 0) || 1;
			const size = 160,
				cx = size / 2,
				cy = size / 2,
				r = 60;
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
				return {
					d,
					color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
					label: labels[i],
					value: v,
				};
			});

			return (
				<div className="my-4 rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
					{title && (
						<div className="mb-3 text-center text-sm font-medium text-gray-200">
							{title}
						</div>
					)}
					<div className="flex flex-wrap items-center justify-center gap-6">
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
						<div className="flex flex-col gap-1.5">
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
						</div>
					</div>
				</div>
			);
		},

		StepIndicator: ({ props }) => {
			const icons: Record<string, string> = {
				done: "✅",
				current: "🔄",
				pending: "⏳",
			};
			const styles: Record<string, string> = {
				done: "border-green-500/30 bg-green-500/10 text-green-300",
				current:
					"border-blue-500/30 bg-blue-500/10 text-blue-300 animate-pulse",
				pending: "border-gray-600/30 bg-gray-600/10 text-gray-400",
			};
			return (
				<span
					className={`my-2 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${styles[props.status]}`}
				>
					<span>{icons[props.status]}</span>
					<span>{props.label}</span>
				</span>
			);
		},

		Callout: ({ props }) => {
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
			const c = config[props.type];
			return (
				<div
					className={`my-3 flex items-start gap-2 rounded-lg border-l-4 px-4 py-3 text-sm ${c.style}`}
				>
					<span>{c.icon}</span>
					<span>{props.message}</span>
				</div>
			);
		},

		Stack: ({ props, children }) => {
			const dirClass =
				props.direction === "horizontal" ? "flex-row" : "flex-col";
			const gapMap = { sm: "gap-1", md: "gap-3", lg: "gap-6" };
			const gapClass = gapMap[props.gap ?? "md"];
			return <div className={`flex ${dirClass} ${gapClass}`}>{children}</div>;
		},
	},
});
