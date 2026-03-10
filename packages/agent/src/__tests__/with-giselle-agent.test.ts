import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeConfigHash } from "../hash";
import { withGiselleAgent } from "../next/with-giselle-agent";

const fetchSpy = vi.spyOn(globalThis, "fetch");

describe("withGiselleAgent", () => {
	const savedEnv = { ...process.env };

	beforeEach(() => {
		fetchSpy.mockReset();
		process.env = { ...savedEnv };
	});

	afterEach(() => {
		process.env = { ...savedEnv };
	});

	it("skips snapshot build when token is missing", async () => {
		delete process.env.GISELLE_AGENT_API_KEY;

		const factory = withGiselleAgent({ reactStrictMode: true }, {});
		const config = await factory("phase-development-server");

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(config).toEqual({ reactStrictMode: true });
		expect(config.env?.GISELLE_AGENT_SNAPSHOT_ID).toBeUndefined();
	});

	it("calls build API without baseSnapshotId and sets env", async () => {
		process.env.GISELLE_AGENT_API_KEY = "test-token";

		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({ snapshot_id: "snap_built", cached: false }),
				{ status: 200 },
			),
		);

		const factory = withGiselleAgent(
			{ reactStrictMode: true, env: { PRESET: "value" } },
			{ agentType: "gemini", files: [{ path: "/x", content: "y" }] },
		);
		const config = await factory("phase-development-server");

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0];
		const headers = new Headers(init?.headers);
		const body = JSON.parse(init?.body as string);

		expect(url).toBe("https://studio.giselles.ai/agent-api/build");
		expect(init?.method).toBe("POST");
		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.get("authorization")).toBe("Bearer test-token");
		expect(config.reactStrictMode).toBe(true);
		expect(config.env?.GISELLE_AGENT_SNAPSHOT_ID).toBe("snap_built");
		expect(config.env?.PRESET).toBe("value");
		expect(body).toEqual({
			config_hash: computeConfigHash({
				agentType: "gemini",
				files: [{ path: "/x", content: "y" }],
			}),
			agent_type: "gemini",
			files: [{ path: "/x", content: "y" }],
		});
	});

	it("trims trailing slash in custom apiUrl", async () => {
		process.env.GISELLE_AGENT_API_KEY = "test-token";

		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({ snapshot_id: "snap_custom", cached: false }),
				{ status: 200 },
			),
		);

		const factory = withGiselleAgent(
			{},
			{},
			{ baseUrl: "https://custom-api.example.com/" },
		);
		await factory("phase-development-server");

		const [url] = fetchSpy.mock.calls[0];
		expect(url).toBe("https://custom-api.example.com/build");
	});

	it('uses default agentType "gemini"', async () => {
		process.env.GISELLE_AGENT_API_KEY = "test-token";

		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({ snapshot_id: "snap_default_type", cached: false }),
				{ status: 200 },
			),
		);

		const factory = withGiselleAgent({}, {});
		await factory("phase-development-server");

		const [, init] = fetchSpy.mock.calls[0];
		const body = JSON.parse(init?.body as string);
		expect(body.agent_type).toBe("gemini");
	});

	it("includes AGENTS.md and GEMINI.md files when agentMd is provided", async () => {
		process.env.GISELLE_AGENT_API_KEY = "test-token";

		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({ snapshot_id: "snap_with_agent_md", cached: false }),
				{ status: 200 },
			),
		);

		const factory = withGiselleAgent(
			{},
			{ agentMd: "test prompt", files: [{ path: "/a.txt", content: "A" }] },
		);
		await factory("phase-development-server");

		const [, init] = fetchSpy.mock.calls[0];
		const body = JSON.parse(init?.body as string);
		expect(body.files).toEqual([
			{ path: "/a.txt", content: "A" },
			{ path: "/home/vercel-sandbox/.codex/AGENTS.md", content: "test prompt" },
			{
				path: "/home/vercel-sandbox/.gemini/GEMINI.md",
				content: "test prompt",
			},
		]);
	});

	it("throws on build API failure", async () => {
		process.env.GISELLE_AGENT_API_KEY = "test-token";

		fetchSpy.mockResolvedValue(
			new Response("Internal Server Error", {
				status: 500,
			}),
		);

		const factory = withGiselleAgent({}, {});
		await expect(factory("phase-development-server")).rejects.toThrow(
			"Build failed (500)",
		);
	});

	it("preserves nextConfig and merges env", async () => {
		process.env.GISELLE_AGENT_API_KEY = "test-token";

		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({ snapshot_id: "snap_merged", cached: true }),
				{ status: 200 },
			),
		);

		const factory = withGiselleAgent(
			{
				env: { NEXT_PUBLIC_FEATURE: "on" },
				compiler: { removeConsole: false },
			},
			{ agentType: "gemini" },
		);
		const config = await factory("phase-development-server");

		expect(config.compiler).toEqual({ removeConsole: false });
		expect(config.env).toEqual({
			NEXT_PUBLIC_FEATURE: "on",
			GISELLE_AGENT_SNAPSHOT_ID: "snap_merged",
		});
	});
});
