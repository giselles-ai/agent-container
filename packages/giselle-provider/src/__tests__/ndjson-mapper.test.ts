import { describe, expect, it } from "vitest";

import {
	createMapperContext,
	extractJsonObjects,
	finishStream,
	mapNdjsonEvent,
} from "../ndjson-mapper";

describe("extractJsonObjects", () => {
	it("parses complete JSON objects and keeps partial tail", () => {
		const { objects, rest } = extractJsonObjects('{"a":1}\\n{"b":2}\\n{"c":');

		expect(objects).toEqual(['{"a":1}', '{"b":2}']);
		expect(rest).toBe('{"c":');
	});
});

describe("mapNdjsonEvent", () => {
	it("maps text-only stream events", () => {
		const ctx = createMapperContext();

		const r1 = mapNdjsonEvent(
			{
				type: "init",
				session_id: "s1",
				modelId: "gemini-model",
			},
			ctx,
		);
		expect(r1.parts).toHaveLength(1);
		expect(r1.parts[0]).toMatchObject({
			type: "response-metadata",
			modelId: "gemini-model",
		});
		expect(r1.sessionUpdate).toEqual({
			geminiSessionId: "s1",
		});

		const r2 = mapNdjsonEvent(
			{
				type: "message",
				role: "assistant",
				content: "Hello ",
				delta: true,
			},
			ctx,
		);
		expect(r2.parts).toHaveLength(2);
		expect(r2.parts[0]).toMatchObject({ type: "text-start" });
		expect(r2.parts[1]).toMatchObject({
			type: "text-delta",
			delta: "Hello ",
		});

		const r3 = mapNdjsonEvent(
			{
				type: "message",
				role: "assistant",
				content: "world!",
				delta: true,
			},
			ctx,
		);
		expect(r3.parts).toHaveLength(1);
		expect(r3.parts[0]).toMatchObject({
			type: "text-delta",
			delta: "world!",
		});

		expect(ctx.textBlockOpen).toBe(true);
		expect(ctx.lastAssistantContent).toBe("Hello world!");

		const r4 = finishStream(ctx);
		expect(r4).toHaveLength(2);
		expect(r4[0]).toMatchObject({ type: "text-end" });
		expect(r4[1]).toMatchObject({
			type: "finish",
			finishReason: {
				unified: "stop",
			},
		});
	});

	it("maps snapshot_request to tool-call and stops stream", () => {
		const ctx = createMapperContext();

		const r1 = mapNdjsonEvent(
			{
				type: "message",
				role: "assistant",
				content: "Filling ",
				delta: true,
			},
			ctx,
		);
		expect(r1.parts).toHaveLength(2);

		const r2 = mapNdjsonEvent(
			{
				type: "snapshot_request",
				requestId: "req-1",
				instruction: "Fill the login form",
			},
			ctx,
		);
		expect(r2.parts).toHaveLength(3);
		expect(r2.parts[0]).toMatchObject({ type: "text-end" });
		expect(r2.parts[1]).toMatchObject({
			type: "tool-call",
			toolCallId: "req-1",
			toolName: "getFormSnapshot",
			input: JSON.stringify({ instruction: "Fill the login form" }),
		});
		expect(r2.parts[2]).toMatchObject({
			type: "finish",
			finishReason: {
				unified: "tool-calls",
			},
		});

		expect(r2.relayRequest).toEqual({
			type: "snapshot_request",
			requestId: "req-1",
			instruction: "Fill the login form",
		});
		expect(r2.sessionUpdate).toEqual({
			pendingRequestId: "req-1",
		});
		expect(ctx.textBlockOpen).toBe(false);
	});

	it("maps snapshot event without error", () => {
		const ctx = createMapperContext();

		const result = mapNdjsonEvent(
			{
				type: "snapshot",
				snapshot_id: "snap_new_123",
			},
			ctx,
		);
		expect(result.parts).toHaveLength(0);
	});

	it("maps sandbox event to sessionUpdate", () => {
		const ctx = createMapperContext();

		const result = mapNdjsonEvent(
			{ type: "sandbox", sandbox_id: "sbx_123" },
			ctx,
		);
		expect(result.sessionUpdate).toEqual({ sandboxId: "sbx_123" });
	});

	it("maps init event to sessionUpdate", () => {
		const ctx = createMapperContext();

		const result = mapNdjsonEvent(
			{ type: "init", session_id: "session_abc", modelId: "gemini" },
			ctx,
		);
		expect(result.sessionUpdate).toEqual({
			geminiSessionId: "session_abc",
		});
	});

	it("maps provider-executed tool events as dynamic tool parts", () => {
		const ctx = createMapperContext();

		const useResult = mapNdjsonEvent(
			{
				type: "tool_use",
				tool_name: "list_directory",
				tool_id: "tool-1",
				parameters: { dir_path: "cdr/cdr" },
			},
			ctx,
		);

		expect(useResult.parts).toEqual([
			{
				type: "tool-call",
				toolCallId: "tool-1",
				toolName: "list_directory",
				input: JSON.stringify({ dir_path: "cdr/cdr" }),
				providerExecuted: true,
				dynamic: true,
			},
		]);

		const resultResult = mapNdjsonEvent(
			{
				type: "tool_result",
				tool_id: "tool-1",
				status: "success",
				output: "Listed 1048 item(s).",
			},
			ctx,
		);

		expect(resultResult.parts).toEqual([
			{
				type: "tool-result",
				toolCallId: "tool-1",
				toolName: "list_directory",
				result: "Listed 1048 item(s).",
				isError: false,
				dynamic: true,
			},
		]);
	});

	it("maps artifact events into dynamic artifact tool parts", () => {
		const ctx = createMapperContext();

		const result = mapNdjsonEvent(
			{
				type: "artifact",
				path: "./artifacts/report.md",
				size_bytes: 1824,
				mime_type: "text/markdown; charset=utf-8",
				label: "report.md",
			},
			ctx,
		);

		expect(result.parts).toHaveLength(2);
		expect(result.parts[0]).toMatchObject({
			type: "tool-call",
			toolName: "artifact",
			input: JSON.stringify({
				path: "./artifacts/report.md",
				size_bytes: 1824,
				mime_type: "text/markdown; charset=utf-8",
				label: "report.md",
			}),
		});
		expect(result.parts[1]).toMatchObject({
			type: "tool-result",
			toolName: "artifact",
			result: {
				type: "artifact",
				path: "./artifacts/report.md",
				size_bytes: 1824,
				mime_type: "text/markdown; charset=utf-8",
				label: "report.md",
			},
			isError: false,
		});
	});

	it("maps multiple artifact events in order", () => {
		const ctx = createMapperContext();

		const r1 = mapNdjsonEvent(
			{
				type: "artifact",
				path: "./artifacts/first.md",
				size_bytes: 10,
				mime_type: "text/markdown; charset=utf-8",
			},
			ctx,
		);
		const r2 = mapNdjsonEvent(
			{
				type: "artifact",
				path: "./artifacts/second.json",
				size_bytes: 20,
				mime_type: "application/json; charset=utf-8",
			},
			ctx,
		);

		expect(r1.parts).toHaveLength(2);
		expect(r2.parts).toHaveLength(2);
		expect(JSON.parse((r1.parts[0] as { input: string }).input).path).toBe(
			"./artifacts/first.md",
		);
		expect(JSON.parse((r2.parts[0] as { input: string }).input).path).toBe(
			"./artifacts/second.json",
		);
	});

	it("maps artifact events between text and snapshot events", () => {
		const ctx = createMapperContext();

		const text = mapNdjsonEvent(
			{
				type: "message",
				role: "assistant",
				content: "done",
				delta: false,
			},
			ctx,
		);
		const artifact = mapNdjsonEvent(
			{
				type: "artifact",
				path: "./artifacts/report.md",
				size_bytes: 999,
				mime_type: "text/markdown; charset=utf-8",
			},
			ctx,
		);
		const snapshot = mapNdjsonEvent(
			{
				type: "snapshot",
			},
			ctx,
		);

		expect(text.parts.length).toBe(3);
		expect(artifact.parts.length).toBe(2);
		expect(snapshot.parts).toHaveLength(0);
		expect(text.parts[text.parts.length - 1]).toMatchObject({
			type: "text-end",
		});
		expect(artifact.parts[0]).toMatchObject({
			type: "tool-call",
			toolName: "artifact",
		});
	});
});

describe("finishStream", () => {
	it("closes open text block and emits finish(stop)", () => {
		const ctx = createMapperContext();
		const r1 = mapNdjsonEvent(
			{
				type: "message",
				role: "assistant",
				content: "Hello ",
				delta: true,
			},
			ctx,
		);
		expect(r1.parts).toHaveLength(2);

		const done = finishStream(ctx);
		expect(done).toHaveLength(2);
		expect(done[0]).toMatchObject({ type: "text-end" });
		expect(done[1]).toMatchObject({
			type: "finish",
			finishReason: {
				unified: "stop",
			},
		});
	});
});
