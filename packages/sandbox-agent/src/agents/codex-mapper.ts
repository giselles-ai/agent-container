export type CodexStdoutMapper = {
	push(chunk: string): string[];
	flush(): string[];
};

function mapEvent(
	event: Record<string, unknown>,
): Record<string, unknown> | null {
	const type = event.type;

	if (type === "session.created") {
		return {
			type: "init",
			session_id: event.id ?? undefined,
			modelId: event.model ?? undefined,
		};
	}

	if (type === "message.output_text.delta") {
		return {
			type: "message",
			role: "assistant",
			content: event.delta ?? "",
			delta: true,
		};
	}

	if (type === "message.output_text.done") {
		return {
			type: "message",
			role: "assistant",
			content: event.text ?? "",
			delta: false,
		};
	}

	if (type === "error") {
		return {
			type: "stderr",
			content:
				typeof event.message === "string"
					? event.message
					: JSON.stringify(event),
		};
	}

	if (type === "response.completed") {
		return null;
	}

	// Keep stream in NDJSON domain only for mapped event types.
	return null;
}

function processLines(text: string): string[] {
	const lines = text.split("\n");
	const completeLines = lines.slice(0, -1);
	const output: string[] = [];

	for (const line of completeLines) {
		const trimmedLine = line.trim();
		if (trimmedLine.length === 0) {
			continue;
		}

		try {
			const event = JSON.parse(trimmedLine) as Record<string, unknown>;
			const mapped = mapEvent(event);
			if (!mapped) {
				continue;
			}

			output.push(`${JSON.stringify(mapped)}\n`);
		} catch {
			// Non-JSON lines are unsupported by the mapper contract.
		}
	}

	return output;
}

export function createCodexStdoutMapper(): CodexStdoutMapper {
	let buffer = "";

	return {
		push(chunk: string): string[] {
			buffer += chunk;
			const combined = buffer;
			const lines = combined.split("\n");
			buffer = lines.pop() ?? "";
			return processLines(lines.join("\n") + "\n");
		},
		flush(): string[] {
			if (buffer.trim().length === 0) {
				return [];
			}

			const remaining = buffer;
			buffer = "";
			return processLines(`${remaining}\n`);
		},
	};
}
