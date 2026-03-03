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
		<div
			className={`relative overflow-x-auto rounded-lg border p-2 transition-all ${
				isBusy ? "border-cyan-500/30 animate-pulse" : "border-slate-700/50"
			}`}
		>
			{isBusy ? (
				<div className="absolute right-2 top-2 z-10 rounded-full border border-cyan-400/80 bg-slate-950/90 px-2 py-1 text-[11px] font-medium text-cyan-200">
					Agent working…
				</div>
			) : null}
			<table className="w-full min-w-max border-collapse">
				<thead>
					<tr>
						<th className="border border-slate-700/50 bg-slate-900/40 px-2 py-1.5 text-center text-xs text-slate-500">
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
										placeholder={`Column ${getColumnLabel(colIndex)}`}
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
						<tr
							key={`row-${
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed grid size, rows never reorder
								rowIndex
							}`}
						>
							<td className="border border-slate-700/50 bg-slate-900/40 px-2 py-1.5 text-xs text-slate-500">
								{rowIndex + 1}
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
		</div>
	);
}
