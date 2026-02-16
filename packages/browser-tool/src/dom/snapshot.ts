import type { FieldKind, SnapshotField } from "../types";

const EXCLUDED_INPUT_TYPES = new Set([
	"hidden",
	"submit",
	"button",
	"file",
	"reset",
	"image",
]);

function normalizeText(input: string | null | undefined): string {
	if (!input) {
		return "";
	}
	return input.replace(/\s+/g, " ").trim();
}

function escapeForSelector(value: string): string {
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(value);
	}
	return value.replace(/(["\\])/g, "\\$1");
}

function isElementVisible(element: Element): boolean {
	if (!(element instanceof HTMLElement)) {
		return true;
	}

	if (element.hidden || element.getAttribute("aria-hidden") === "true") {
		return false;
	}

	const style = window.getComputedStyle(element);
	if (style.display === "none" || style.visibility === "hidden") {
		return false;
	}

	return true;
}

function inferKind(element: Element): FieldKind | null {
	if (element instanceof HTMLTextAreaElement) {
		return "textarea";
	}

	if (element instanceof HTMLSelectElement) {
		return "select";
	}

	if (element instanceof HTMLInputElement) {
		const type = (element.type || "text").toLowerCase();
		if (EXCLUDED_INPUT_TYPES.has(type)) {
			return null;
		}
		if (type === "checkbox") {
			return "checkbox";
		}
		if (type === "radio") {
			return "radio";
		}
		return "text";
	}

	return null;
}

function queryLabelByFor(element: Element): string {
	const id = element.getAttribute("id");
	if (!id) {
		return "";
	}

	const label = document.querySelector(`label[for="${escapeForSelector(id)}"]`);
	return normalizeText(label?.textContent);
}

function queryAriaLabelledby(element: Element): string {
	const labelledby = normalizeText(element.getAttribute("aria-labelledby"));
	if (!labelledby) {
		return "";
	}

	const ids = labelledby.split(/\s+/).filter(Boolean);
	const parts = ids
		.map((id) => document.getElementById(id))
		.map((node) => normalizeText(node?.textContent))
		.filter(Boolean);

	return normalizeText(parts.join(" "));
}

function resolveLabel(element: Element): string {
	const fromFor = queryLabelByFor(element);
	if (fromFor) {
		return fromFor;
	}

	const fromAriaLabel = normalizeText(element.getAttribute("aria-label"));
	if (fromAriaLabel) {
		return fromAriaLabel;
	}

	const fromAriaLabelledBy = queryAriaLabelledby(element);
	if (fromAriaLabelledBy) {
		return fromAriaLabelledBy;
	}

	const fromAncestorLabel = normalizeText(
		element.closest("label")?.textContent,
	);
	if (fromAncestorLabel) {
		return fromAncestorLabel;
	}

	return (
		normalizeText(element.getAttribute("name")) ||
		normalizeText(element.getAttribute("id")) ||
		"unnamed-field"
	);
}

function selectorIsUnique(selector: string, element: Element): boolean {
	try {
		const nodes = document.querySelectorAll(selector);
		return nodes.length === 1 && nodes[0] === element;
	} catch {
		return false;
	}
}

function buildUniqueCssSelector(element: Element): string {
	const dataRpaId = element.getAttribute("data-rpa-id");
	if (dataRpaId) {
		return `[data-rpa-id="${escapeForSelector(dataRpaId)}"]`;
	}

	const id = element.getAttribute("id");
	if (id) {
		return `#${escapeForSelector(id)}`;
	}

	const segments: string[] = [];
	let node: Element | null = element;

	while (node && node !== document.documentElement) {
		const tag = node.tagName.toLowerCase();
		const currentTagName = node.tagName;
		const parentElement: Element | null = node.parentElement;

		if (!parentElement) {
			segments.unshift(tag);
			break;
		}

		const siblingCandidates = Array.from(parentElement.children).filter(
			(candidate) => candidate.tagName === currentTagName,
		);
		const nth = siblingCandidates.indexOf(node) + 1;
		segments.unshift(`${tag}:nth-of-type(${nth})`);

		const candidateSelector = segments.join(" > ");
		if (selectorIsUnique(candidateSelector, element)) {
			return candidateSelector;
		}

		node = parentElement;
	}

	return segments.join(" > ") || element.tagName.toLowerCase();
}

function readCurrentValue(element: Element): string | boolean {
	if (element instanceof HTMLInputElement) {
		const type = (element.type || "text").toLowerCase();
		if (type === "checkbox" || type === "radio") {
			return element.checked;
		}
		return element.value;
	}

	if (
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLSelectElement
	) {
		return element.value;
	}

	return "";
}

function readOptions(element: Element): string[] | undefined {
	if (element instanceof HTMLSelectElement) {
		const options = Array.from(element.options)
			.map((option) => normalizeText(option.textContent) || option.value)
			.filter(Boolean);
		return options.length > 0 ? options : undefined;
	}

	if (
		element instanceof HTMLInputElement &&
		element.type === "radio" &&
		element.name
	) {
		const selector = `input[type="radio"][name="${escapeForSelector(element.name)}"]`;
		const options = Array.from(document.querySelectorAll(selector))
			.map((node) => (node instanceof HTMLInputElement ? node.value : ""))
			.filter(Boolean);
		return options.length > 0 ? options : undefined;
	}

	return undefined;
}

export function snapshot(root?: ParentNode): SnapshotField[] {
	const queryRoot = root ?? document;
	const candidates = Array.from(
		queryRoot.querySelectorAll("input, textarea, select"),
	);
	const seenFieldIds = new Set<string>();

	const fields: SnapshotField[] = [];

	for (const element of candidates) {
		if (!isElementVisible(element)) {
			continue;
		}

		const kind = inferKind(element);
		if (!kind) {
			continue;
		}

		const dataRpaId = normalizeText(element.getAttribute("data-rpa-id"));
		const selector = dataRpaId
			? `[data-rpa-id="${escapeForSelector(dataRpaId)}"]`
			: buildUniqueCssSelector(element);
		const fieldId = dataRpaId ? `rpa:${dataRpaId}` : `css:${selector}`;

		if (seenFieldIds.has(fieldId)) {
			continue;
		}

		seenFieldIds.add(fieldId);

		const required =
			element.hasAttribute("required") ||
			element.getAttribute("aria-required") === "true";

		const placeholder =
			element instanceof HTMLInputElement ||
			element instanceof HTMLTextAreaElement
				? normalizeText(element.placeholder) || undefined
				: undefined;

		fields.push({
			fieldId,
			selector,
			kind,
			label: resolveLabel(element),
			name: normalizeText(element.getAttribute("name")) || undefined,
			required,
			placeholder,
			currentValue: readCurrentValue(element),
			options: readOptions(element),
		});
	}

	return fields;
}
