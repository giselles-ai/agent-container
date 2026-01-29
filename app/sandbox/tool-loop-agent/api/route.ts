import { Sandbox } from "@vercel/sandbox";
import { createSandboxSsePassthroughResponse } from "@/lib/sandbox/sandbox-stream";

const fallbackText =
	"Today we stream a longer message in chunks so the SSE client can render partial output as it arrives. This is useful for progress logs, summaries, or any output that benefits from incremental updates. Each chunk is printed with a short delay to simulate work being done inside the sandbox. Adjust the chunk size or delay to match your UX needs.";

export async function GET(req: Request) {
	return createSandboxSsePassthroughResponse(
		req,
		async ({ stdout, stderr, signal }) => {
			const sandbox = await Sandbox.create();
			return sandbox.runCommand({
				cmd: "node",
				args: [
					"-e",
					"const text = process.env.LONG_TEXT ?? ''; const size = 120; let i = 0; const interval = setInterval(() => { if (i >= text.length) { clearInterval(interval); return; } console.log(text.slice(i, i + size)); i += size; }, 200);",
				],
				env: {
					LONG_TEXT: fallbackText,
				},
				stdout,
				stderr,
				signal,
			});
		},
	);
}

export async function POST(req: Request) {
	return createSandboxSsePassthroughResponse(
		req,
		async ({ stdout, stderr, signal }) => {
			const sandbox = await Sandbox.create({
				source: {
					type: "git",
					url: "https://github.com/giselles-ai/agent-container",
					revision: "82a47987",
				},
			});
			return sandbox.runCommand({
				cmd: "pnpm",
				args: ["tsx", "agent.ts"],
				stdout,
				stderr,
				signal,
			});
		},
	);
}
