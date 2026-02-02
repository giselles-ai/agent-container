import { Sandbox } from "@vercel/sandbox";
import type { UIMessage } from "ai";
import { readTemplateFiles } from "@/lib/sandbox/read-template-files";
import { createSandboxSsePassthroughResponse } from "@/lib/sandbox/sandbox-stream";

export async function POST(req: Request) {
	const oidcToken = req.headers.get("x-vercel-oidc-token");

	const { messages: requestMessages }: { messages: UIMessage[] } =
		await req.json();
	return createSandboxSsePassthroughResponse(
		req,
		async ({ stdout, stderr, signal }) => {
			const sandbox = await Sandbox.create();

			console.log(`Sandbox created: ${sandbox.sandboxId}`);

			const files = await readTemplateFiles(
				"app/sandbox/tool-loop-agent/api/sandbox-template",
			);

			await sandbox.writeFiles([
				...files,
				{
					path: "messages.json",
					content: Buffer.from(JSON.stringify(requestMessages)),
				},
			]);
			await sandbox.runCommand({
				cmd: "pnpm",
				args: ["install"],
			});
			await sandbox.runCommand({
				cmd: "pnpm",
				args: ["tsx", "index.ts"],
				stdout,
				stderr,
				signal,
				env: {
					VERCEL_OIDC_TOKEN: oidcToken ?? process.env.VERCEL_OIDC_TOKEN ?? "",
				},
			});
		},
	);
}
