import { SpreadsheetGrid } from "./_components/spreadsheet-grid";

export default function SpreadsheetDemoPage() {
	return (
		<main className="min-h-screen p-6 text-slate-100 sm:p-10">
			<h1 className="text-2xl font-semibold">Spreadsheet Demo</h1>
			<p className="mt-2 text-sm text-slate-400">
				Each cell is an input with data-browser-tool-id — the existing
				browser-tool operates on them.
			</p>
			<div className="mt-6">
				<SpreadsheetGrid rows={10} columns={6} />
			</div>
		</main>
	);
}
