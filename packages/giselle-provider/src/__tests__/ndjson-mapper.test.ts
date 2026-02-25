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
