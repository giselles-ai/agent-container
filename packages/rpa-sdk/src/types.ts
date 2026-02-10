import type { ReactNode } from "react";

export type FieldKind = "text" | "textarea" | "select" | "checkbox" | "radio";

export type SnapshotField = {
  fieldId: string;
  selector: string;
  kind: FieldKind;
  label: string;
  name?: string;
  required: boolean;
  placeholder?: string;
  currentValue: string | boolean;
  options?: string[];
};

export type FillAction = {
  action: "fill";
  fieldId: string;
  value: string;
};

export type ClickAction = {
  action: "click";
  fieldId: string;
};

export type SelectAction = {
  action: "select";
  fieldId: string;
  value: string;
};

export type RpaAction = FillAction | ClickAction | SelectAction;

export type ExecutionReport = {
  applied: number;
  skipped: number;
  warnings: string[];
};

export type PlanResult = {
  fields: SnapshotField[];
  actions: RpaAction[];
  warnings: string[];
};

export type RpaStatus =
  | "idle"
  | "snapshotting"
  | "planning"
  | "ready"
  | "applying"
  | "error";

export type RpaProviderProps = {
  endpoint: string;
  children: ReactNode;
};

export type PromptPanelProps = {
  defaultInstruction?: string;
  defaultDocument?: string;
  mount?: "bottom-right" | "inline";
};
