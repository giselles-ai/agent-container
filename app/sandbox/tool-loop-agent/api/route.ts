import { readFile } from "node:fs/promises";
import { Sandbox } from "@vercel/sandbox";
import { createSandboxSsePassthroughResponse } from "@/lib/sandbox/sandbox-stream";

export async function POST(req: Request) {
	return createSandboxSsePassthroughResponse(
		req,
		async ({ stdout, stderr, signal }) => {
			const sandbox = await Sandbox.create();

			const [indexTs, packageJson, toolsTs] = await Promise.all([
				readFile(new URL("./sandbox-template/index.ts", import.meta.url)),
				readFile(new URL("./sandbox-template/package.json", import.meta.url)),
				readFile(new URL("./sandbox-template/tools.ts", import.meta.url)),
			]);

			await sandbox.writeFiles([
				{ path: "index.ts", content: indexTs },
				{ path: "package.json", content: packageJson },
				{ path: "tools.ts", content: toolsTs },
			]);
			await sandbox.runCommand({
				cmd: "pnpm",
				args: ["install"],
			});
			return sandbox.runCommand({
				cmd: "pnpm",
				args: ["tsx", "index.ts"],
				stdout,
				stderr,
				signal,
				env: {
					VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN ?? "",
				},
			});
		},
	);
}
