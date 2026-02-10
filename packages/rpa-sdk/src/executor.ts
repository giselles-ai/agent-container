import type { ExecutionReport, RpaAction, SnapshotField } from "./types";

function escapeForSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/(["\\])/g, "\\$1");
}

function safeQuery(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function resolveElement(actionFieldId: string, fields: SnapshotField[], root: ParentNode): Element | null {
  if (actionFieldId.startsWith("rpa:")) {
    const rpaId = actionFieldId.slice("rpa:".length);
    const direct = safeQuery(root, `[data-rpa-id="${escapeForSelector(rpaId)}"]`);
    if (direct) {
      return direct;
    }
  }

  if (actionFieldId.startsWith("css:")) {
    const selector = actionFieldId.slice("css:".length);
    const direct = safeQuery(root, selector);
    if (direct) {
      return direct;
    }
  }

  const field = fields.find((candidate) => candidate.fieldId === actionFieldId);
  if (!field) {
    return null;
  }

  return safeQuery(root, field.selector);
}

function setNativeValue(target: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(target, value);
  } else {
    target.value = value;
  }
}

function emitInputEvents(target: Element): void {
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

export function execute(
  actions: RpaAction[],
  fields: SnapshotField[],
  root: ParentNode = document
): ExecutionReport {
  const report: ExecutionReport = {
    applied: 0,
    skipped: 0,
    warnings: []
  };

  for (const action of actions) {
    const element = resolveElement(action.fieldId, fields, root);

    if (!element) {
      report.skipped += 1;
      report.warnings.push(`Element not found for fieldId: ${action.fieldId}`);
      continue;
    }

    if (action.action === "click") {
      if (element instanceof HTMLElement) {
        element.click();
        report.applied += 1;
      } else {
        report.skipped += 1;
        report.warnings.push(`Click target is not an HTMLElement: ${action.fieldId}`);
      }
      continue;
    }

    if (action.action === "fill") {
      if (element instanceof HTMLInputElement) {
        const type = element.type.toLowerCase();
        if (type === "checkbox" || type === "radio") {
          report.skipped += 1;
          report.warnings.push(`fill is not supported for ${type}: ${action.fieldId}`);
          continue;
        }

        setNativeValue(element, action.value);
        emitInputEvents(element);
        report.applied += 1;
        continue;
      }

      if (element instanceof HTMLTextAreaElement) {
        setNativeValue(element, action.value);
        emitInputEvents(element);
        report.applied += 1;
        continue;
      }

      if (element instanceof HTMLSelectElement) {
        report.skipped += 1;
        report.warnings.push(`fill is not supported for select: ${action.fieldId}`);
        continue;
      }

      report.skipped += 1;
      report.warnings.push(`Unsupported fill target: ${action.fieldId}`);
      continue;
    }

    if (!(element instanceof HTMLSelectElement)) {
      report.skipped += 1;
      report.warnings.push(`select action target is not a <select>: ${action.fieldId}`);
      continue;
    }

    const matchedOption = Array.from(element.options).find(
      (option) => option.value === action.value || option.text.trim() === action.value
    );

    const nextValue = matchedOption ? matchedOption.value : action.value;
    element.value = nextValue;

    if (element.value !== nextValue) {
      report.skipped += 1;
      report.warnings.push(`Option not found for select action: ${action.fieldId}`);
      continue;
    }

    emitInputEvents(element);
    report.applied += 1;
  }

  return report;
}
