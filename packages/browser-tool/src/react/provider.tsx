"use client";

import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useCallback,
	useMemo,
	useState,
} from "react";
import type {
	BrowserToolAction,
	BrowserToolStatus,
	ExecutionReport,
	SnapshotField,
} from "..";
import { execute, snapshot } from "../dom";

type RunInput = {
	instruction: string;
	document?: string;
};

type BrowserToolPlan = {
	fields: SnapshotField[];
	actions: BrowserToolAction[];
	warnings: string[];
};

export type BrowserToolProviderProps = {
	endpoint: string;
	children: ReactNode;
};

export type BrowserToolContextValue = {
	endpoint: string;
	status: BrowserToolStatus;
	lastPlan: BrowserToolPlan | null;
	lastExecution: ExecutionReport | null;
	error: string | null;
	setError: Dispatch<SetStateAction<string | null>>;
	run: (input: RunInput) => Promise<BrowserToolPlan>;
	apply: (
		actions: BrowserToolAction[],
		fields: SnapshotField[],
	) => ExecutionReport;
};

export const BrowserToolContext = createContext<BrowserToolContextValue | null>(
	null,
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function isAction(value: unknown): value is BrowserToolAction {
	if (
		!isRecord(value) ||
		typeof value.action !== "string" ||
		typeof value.fieldId !== "string"
	) {
		return false;
	}

	if (value.action === "click") {
		return true;
	}

	if (
		(value.action === "fill" || value.action === "select") &&
		typeof value.value === "string"
	) {
		return true;
	}

	return false;
}

function parseWarnings(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}

export function BrowserToolProvider({
	endpoint,
	children,
}: BrowserToolProviderProps) {
	const [status, setStatus] = useState<BrowserToolStatus>("idle");
	const [lastPlan, setLastPlan] = useState<BrowserToolPlan | null>(null);
	const [lastExecution, setLastExecution] = useState<ExecutionReport | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	const run = useCallback(
		async ({ instruction, document }: RunInput): Promise<BrowserToolPlan> => {
			const trimmedInstruction = instruction.trim();
			if (!trimmedInstruction) {
				throw new Error("Instruction is required.");
			}

			setError(null);
			setStatus("snapshotting");

			try {
				const fields = snapshot();
				setStatus("planning");

				const response = await fetch(endpoint, {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						instruction: trimmedInstruction,
						document: document?.trim() ? document.trim() : undefined,
						fields,
					}),
				});

				const payload = (await response.json().catch(() => null)) as unknown;

				if (!response.ok) {
					const message =
						isRecord(payload) && typeof payload.error === "string"
							? payload.error
							: `Planning failed with status ${response.status}`;
					throw new Error(message);
				}

				const actions =
					isRecord(payload) && Array.isArray(payload.actions)
						? payload.actions.filter(isAction)
						: [];
				const warnings = isRecord(payload)
					? parseWarnings(payload.warnings)
					: [];

				const plan: BrowserToolPlan = {
					fields,
					actions,
					warnings,
				};

				setLastPlan(plan);
				setLastExecution(null);
				setStatus("ready");

				return plan;
			} catch (runError) {
				const message =
					runError instanceof Error
						? runError.message
						: "Failed to run planner.";
				setError(message);
				setStatus("error");
				throw runError;
			}
		},
		[endpoint],
	);

	const apply = useCallback(
		(actions: BrowserToolAction[], fields: SnapshotField[]) => {
			setError(null);
			setStatus("applying");

			try {
				const report = execute(actions, fields);
				setLastExecution(report);
				setStatus("idle");
				return report;
			} catch (applyError) {
				const message =
					applyError instanceof Error
						? applyError.message
						: "Failed to apply actions.";
				setError(message);
				setStatus("error");
				throw applyError;
			}
		},
		[],
	);

	const contextValue = useMemo<BrowserToolContextValue>(
		() => ({
			endpoint,
			status,
			lastPlan,
			lastExecution,
			error,
			setError,
			run,
			apply,
		}),
		[apply, endpoint, error, lastExecution, lastPlan, run, status],
	);

	return (
		<BrowserToolContext.Provider value={contextValue}>
			{children}
		</BrowserToolContext.Provider>
	);
}
