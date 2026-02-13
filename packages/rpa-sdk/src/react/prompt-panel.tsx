"use client";

import { useMemo, useState } from "react";
import type { PromptPanelProps, RpaAction } from "../types";
import { useRpa } from "./use-rpa";

function describeAction(action: RpaAction): string {
	if (action.action === "click") {
		return `click ${action.fieldId}`;
	}
	if (action.action === "fill") {
		return `fill ${action.fieldId} = ${JSON.stringify(action.value)}`;
	}
	return `select ${action.fieldId} = ${JSON.stringify(action.value)}`;
}

export function PromptPanel({
	defaultInstruction = "",
	defaultDocument = "",
	mount = "bottom-right",
}: PromptPanelProps) {
	const { status, run, apply, lastPlan, lastExecution, error, setError } =
		useRpa();
	const [instruction, setInstruction] = useState(defaultInstruction);
	const [documentText, setDocumentText] = useState(defaultDocument);
	const [notice, setNotice] = useState<string | null>(null);

	const isPlanning = status === "snapshotting" || status === "planning";
	const isApplying = status === "applying";

	const combinedWarnings = useMemo(() => {
		const planWarnings = lastPlan?.warnings ?? [];
		const executionWarnings = lastExecution?.warnings ?? [];
		return [...planWarnings, ...executionWarnings];
	}, [lastExecution, lastPlan]);

	async function handlePlan(): Promise<void> {
		if (!instruction.trim()) {
			return;
		}

		setNotice(null);
		setError(null);

		try {
			const plan = await run({
				instruction: instruction.trim(),
				document: documentText.trim() || undefined,
			});

			if (plan.actions.length === 0) {
				setNotice(
					"No actions were generated. Try giving more explicit instructions.",
				);
				return;
			}

			setNotice(
				`Plan created: ${plan.actions.length} action(s). Review and click Apply.`,
			);
		} catch (planError) {
			setNotice(
				planError instanceof Error ? planError.message : "Planning failed.",
			);
		}
	}

	function handleApply(): void {
		if (!lastPlan || lastPlan.actions.length === 0) {
			return;
		}

		setNotice(null);
		setError(null);

		const report = apply(lastPlan.actions, lastPlan.fields);
		setNotice(
			`Applied ${report.applied} action(s), skipped ${report.skipped}.`,
		);
	}

	const wrapperClass =
		mount === "bottom-right"
			? "fixed bottom-4 right-4 z-50 w-[min(28rem,calc(100vw-2rem))]"
			: "w-full max-w-xl";

	return (
		<section className={wrapperClass}>
			<div className="rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
				<div className="mb-3 flex items-center justify-between">
					<p className="text-xs uppercase tracking-[0.15em] text-cyan-300">
						RPA Prompt Panel
					</p>
					<p className="text-[11px] text-slate-400">status: {status}</p>
				</div>

				<div className="space-y-3">
					<label className="block">
						<span className="mb-1 block text-xs text-slate-300">
							Instruction
						</span>
						<textarea
							rows={2}
							value={instruction}
							onChange={(event) => setInstruction(event.target.value)}
							placeholder="Fill title and body with a concise summary..."
							className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
						/>
					</label>

					<label className="block">
						<span className="mb-1 block text-xs text-slate-300">
							Document (optional)
						</span>
						<textarea
							rows={4}
							value={documentText}
							onChange={(event) => setDocumentText(event.target.value)}
							placeholder="Paste source document here"
							className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
						/>
					</label>

					<div className="flex gap-2">
						<button
							type="button"
							onClick={handlePlan}
							disabled={!instruction.trim() || isPlanning || isApplying}
							className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isPlanning ? "Planning..." : "Plan"}
						</button>
						<button
							type="button"
							onClick={handleApply}
							disabled={
								!lastPlan ||
								lastPlan.actions.length === 0 ||
								isPlanning ||
								isApplying
							}
							className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isApplying ? "Applying..." : "Apply"}
						</button>
					</div>

					{notice ? <p className="text-xs text-slate-300">{notice}</p> : null}
					{error ? <p className="text-xs text-rose-400">{error}</p> : null}
				</div>

				<div className="mt-4 border-t border-slate-800 pt-3">
					<p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
						Action Plan
					</p>
					{!lastPlan ? (
						<p className="mt-2 text-xs text-slate-500">No plan yet.</p>
					) : lastPlan.actions.length === 0 ? (
						<p className="mt-2 text-xs text-slate-500">
							Planner returned no actions.
						</p>
					) : (
						<ul className="mt-2 space-y-1">
							{lastPlan.actions.map((action, index) => (
								<li
									key={`${action.fieldId}-${action.action}-${index}`}
									className="rounded-md border border-slate-800 bg-slate-900/80 px-2 py-1 text-xs text-slate-200"
								>
									{describeAction(action)}
								</li>
							))}
						</ul>
					)}

					{combinedWarnings.length > 0 ? (
						<div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200">
								Warnings
							</p>
							<ul className="mt-1 space-y-1 text-xs text-amber-100">
								{combinedWarnings.map((warning, index) => (
									<li
										key={`${warning}-${
											// biome-ignore lint/suspicious/noArrayIndexKey: wip
											index
										}`}
									>
										- {warning}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}
