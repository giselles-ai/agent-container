import { describe, expect, it } from "vitest";
import { createCodexStdoutMapper } from "./codex-mapper";

describe("createCodexStdoutMapper", () => {
	it("maps supported Codex events to normalized NDJSON", () => {
		const mapper = createCodexStdoutMapper();
		const events = [
			'{"type":"thread.started","thread_id":"thread-abc-123"}',
			'{"type":"session.created","id":"session-1","model":"codex-small"}',
			'{"type":"message.output_text.delta","delta":"Hello"}',
			'{"type":"message.output_text.done","text":"!"}',
			'{"type":"error","message":"Oops"}',
		].join("\n");

		const lines = mapper.push(`${events}\n`);

		expect(lines).toEqual([
			`${JSON.stringify({
				type: "init",
				session_id: "thread-abc-123",
			})}\n`,
			`${JSON.stringify({
				type: "init",
				modelId: "codex-small",
			})}\n`,
			`${JSON.stringify({
				type: "message",
				role: "assistant",
				content: "Hello",
				delta: true,
			})}\n`,
			`${JSON.stringify({
				type: "message",
				role: "assistant",
				content: "!",
				delta: false,
			})}\n`,
			`${JSON.stringify({ type: "stderr", content: "Oops" })}\n`,
		]);
	});

	it("maps thread.started to init with session_id", () => {
		const mapper = createCodexStdoutMapper();
		const lines = mapper.push(
			'{"type":"thread.started","thread_id":"0199a213-81c0-7800-8aa1-bbab2a035a53"}\n',
		);

		expect(lines).toEqual([
			`${JSON.stringify({
				type: "init",
				session_id: "0199a213-81c0-7800-8aa1-bbab2a035a53",
			})}\n`,
		]);
	});

	it("maps session.created to init with only modelId", () => {
		const mapper = createCodexStdoutMapper();
		const lines = mapper.push(
			'{"type":"session.created","id":"sess_abc","model":"gpt-5-codex"}\n',
		);

		expect(lines).toEqual([
			`${JSON.stringify({
				type: "init",
				modelId: "gpt-5-codex",
			})}\n`,
		]);
	});

	it("drops unsupported event types", () => {
		const mapper = createCodexStdoutMapper();
		const lines = mapper.push(
			'{"type":"response.completed"}\n{"type":"unknown.event"}\n',
		);

		expect(lines).toEqual([]);
	});

	it("ignores invalid JSON lines and keeps processing valid lines", () => {
		const mapper = createCodexStdoutMapper();
		const lines = mapper.push(
			'{"type":"session.created","id":"session-1"\n{"type":"message.output_text.done","text":"done"}\n',
		);

		expect(lines).toEqual([
			`${JSON.stringify({
				type: "message",
				role: "assistant",
				content: "done",
				delta: false,
			})}\n`,
		]);
	});

	it("handles fragmented chunks and flushes trailing complete line", () => {
		const mapper = createCodexStdoutMapper();
		const first = mapper.push(
			'{"type":"message.output_text.delta","delta":"Hel',
		);
		const second = mapper.push(
			'lo"}\n{"type":"message.output_text.done","text":"X"}',
		);
		const final = mapper.flush();

		expect(first).toEqual([]);
		expect(second).toEqual([
			`${JSON.stringify({
				type: "message",
				role: "assistant",
				content: "Hello",
				delta: true,
			})}\n`,
		]);
		expect(final).toEqual([
			`${JSON.stringify({
				type: "message",
				role: "assistant",
				content: "X",
				delta: false,
			})}\n`,
		]);
	});
});
