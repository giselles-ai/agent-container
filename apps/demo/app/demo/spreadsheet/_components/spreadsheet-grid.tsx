"use client";

import { useState } from "react";

type SpreadsheetGridProps = {
	rows?: number;
	columns?: number;
	isBusy?: boolean;
};

function getColumnLabel(index: number): string {
	let label = "";
	let value = index;

	while (value >= 0) {
		label = String.fromCharCode((value % 26) + 65) + label;
		value = Math.floor(value / 26) - 1;
	}

	return label;
}

export function SpreadsheetGrid({
	rows = 10,
	columns = 6,
	isBusy = false,
}: SpreadsheetGridProps) {
	const [cells, setCells] = useState<Record<string, string>>({});

	const handleChange = (id: string, value: string) => {
		setCells((prev) => ({ ...prev, [id]: value }));
	};

	return (
		<div className="overflow-x-auto relative">
			<table className="w-full border-collapse">
				<thead>
					<tr>
						<th className="w-px border border-slate-700/50 bg-slate-900/40 px-2 py-1.5 text-center text-xs text-slate-500">
							<span className="sr-only">Row</span>
						</th>
						{Array.from({ length: columns }).map((_, colIndex) => {
							const headerId = `header-${colIndex}`;

							return (
								<th
									key={headerId}
									className="border border-slate-700/50 bg-slate-900/20"
								>
									<input
										type="text"
										data-browser-tool-id={headerId}
										value={cells[headerId] ?? ""}
										onChange={(event) =>
											handleChange(headerId, event.target.value)
										}
										placeholder={getColumnLabel(colIndex)}
										aria-label={`Header column ${colIndex}`}
										className="block w-full border-none px-2 py-1.5 bg-slate-900/80 text-xs font-medium text-slate-200 outline-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
									/>
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{Array.from({ length: rows }).map((_, rowIndex) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: render-only list, no reordering
						<tr key={`row-${rowIndex}`}>
							<td className="w-px whitespace-nowrap border border-slate-700/50 bg-slate-900/40">
								{(() => {
									const rowHeaderId = `row-header-${rowIndex}`;
									const val = cells[rowHeaderId] ?? "";
									const placeholder = `${rowIndex + 1}`;
									const displayLen = val.length || placeholder.length;

									return (
										<input
											type="text"
											size={Math.max(displayLen, 1)}
											data-browser-tool-id={rowHeaderId}
											value={val}
											onChange={(event) =>
												handleChange(rowHeaderId, event.target.value)
											}
											placeholder={placeholder}
											aria-label={`Row ${rowIndex} header`}
											className="block border-none bg-transparent px-2 py-1.5 text-xs text-slate-500 outline-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
										/>
									);
								})()}
							</td>
							{Array.from({ length: columns }).map((_, colIndex) => {
								const cellId = `cell-${rowIndex}-${colIndex}`;

								return (
									<td
										key={cellId}
										className="border border-slate-700/50 bg-slate-950/30"
									>
										<input
											type="text"
											data-browser-tool-id={cellId}
											value={cells[cellId] ?? ""}
											onChange={(event) =>
												handleChange(cellId, event.target.value)
											}
											aria-label={`Cell row ${rowIndex} column ${colIndex}`}
											className="block w-full border-none bg-transparent px-2 py-1.5 text-sm text-slate-100 outline-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
										/>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
			{isBusy && (
				<div
					style={{
						backgroundImage: `linear-gradient(
						105deg,
						transparent 40%,
						rgba(6,182,212,0.01) 43%,
						rgba(6,182,212,0.02) 45%,
						rgba(6,182,212,0.04) 48%,
						rgba(6,182,212,0.04) 50%,
						rgba(6,182,212,0.04) 52%,
						rgba(6,182,212,0.02) 55%,
						rgba(6,182,212,0.01) 57%,
						transparent 60%
					)`,
						backgroundSize: "200% 100%",
						backgroundRepeat: "no-repeat",
					}}
					className={
						"pointer-events-none absolute inset-0 z-10 animate-[shimmer_3.0s_linear_infinite]"
					}
				/>
			)}
		</div>
	);
}
