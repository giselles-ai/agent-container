import { Sandbox } from "@vercel/sandbox";
import { readTemplateFiles } from "@/lib/sandbox/read-template-files";
import { createSandboxSsePassthroughResponse } from "@/lib/sandbox/sandbox-stream";

export async function POST(req: Request) {
	const oidcToken = req.headers.get("x-vercel-oidc-token");
	return createSandboxSsePassthroughResponse(
		req,
		async ({ stdout, stderr, signal }) => {
			const sandbox = await Sandbox.create();

			const files = await readTemplateFiles(
				"app/sandbox/tool-loop-agent/api/sandbox-template",
			);

			await sandbox.writeFiles(files);
			await sandbox.runCommand({
				cmd: "pnpm",
				args: ["install"],
			});
			sandbox.runCommand({
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
