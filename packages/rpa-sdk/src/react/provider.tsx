"use client";

import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState
} from "react";
import { execute } from "../executor";
import { snapshot } from "../snapshot";
import type {
  ExecutionReport,
  PlanResult,
  RpaAction,
  RpaProviderProps,
  RpaStatus,
  SnapshotField
} from "../types";

type RunInput = {
  instruction: string;
  document?: string;
};

export type RpaContextValue = {
  endpoint: string;
  status: RpaStatus;
  lastPlan: PlanResult | null;
  lastExecution: ExecutionReport | null;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  run: (input: RunInput) => Promise<PlanResult>;
  apply: (actions: RpaAction[], fields: SnapshotField[]) => ExecutionReport;
};

export const RpaContext = createContext<RpaContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isAction(value: unknown): value is RpaAction {
  if (!isRecord(value) || typeof value.action !== "string" || typeof value.fieldId !== "string") {
    return false;
  }

  if (value.action === "click") {
    return true;
  }

  if ((value.action === "fill" || value.action === "select") && typeof value.value === "string") {
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

export function RpaProvider({ endpoint, children }: RpaProviderProps) {
  const [status, setStatus] = useState<RpaStatus>("idle");
  const [lastPlan, setLastPlan] = useState<PlanResult | null>(null);
  const [lastExecution, setLastExecution] = useState<ExecutionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async ({ instruction, document }: RunInput): Promise<PlanResult> => {
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
            "content-type": "application/json"
          },
          body: JSON.stringify({
            instruction: trimmedInstruction,
            document: document?.trim() ? document.trim() : undefined,
            fields
          })
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
        const warnings = isRecord(payload) ? parseWarnings(payload.warnings) : [];

        const plan: PlanResult = {
          fields,
          actions,
          warnings
        };

        setLastPlan(plan);
        setLastExecution(null);
        setStatus("ready");

        return plan;
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : "Failed to run planner.";
        setError(message);
        setStatus("error");
        throw runError;
      }
    },
    [endpoint]
  );

  const apply = useCallback((actions: RpaAction[], fields: SnapshotField[]) => {
    setError(null);
    setStatus("applying");

    try {
      const report = execute(actions, fields);
      setLastExecution(report);
      setStatus("idle");
      return report;
    } catch (applyError) {
      const message = applyError instanceof Error ? applyError.message : "Failed to apply actions.";
      setError(message);
      setStatus("error");
      throw applyError;
    }
  }, []);

  const contextValue = useMemo<RpaContextValue>(
    () => ({
      endpoint,
      status,
      lastPlan,
      lastExecution,
      error,
      setError,
      run,
      apply
    }),
    [apply, endpoint, error, lastExecution, lastPlan, run, status]
  );

  return <RpaContext.Provider value={contextValue}>{children}</RpaContext.Provider>;
}
