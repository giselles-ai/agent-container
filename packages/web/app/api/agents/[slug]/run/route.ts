import type { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { getBundle, getManifest } from "@/lib/agent/storage";
import {
	createSandboxSsePassthroughResponse,
	createSandboxStreamResponse,
	extractLatestUserText,
} from "@/lib/sandbox/sandbox-stream";

type Params = {
	params: Promise<{ slug: string }>;
};

function buildEnv(requiredKeys: string[]) {
	const env: Record<string, string> = {};
	for (const key of requiredKeys) {
		const value = process.env[key];
		if (value !== undefined) {
			env[key] = value;
		}
	}
	return env;
}

export async function POST(req: Request, props: Params) {
	const params = await props.params;
	const authError = requireApiToken(req);
	if (authError) return authError;

	const body = (await req.json().catch(() => null)) as { messages?: unknown };
	const prompt =
		body && typeof body === "object"
			? extractLatestUserText((body as { messages?: never }).messages)
			: null;

	const manifest = await getManifest(params.slug);
	if (!manifest) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	const bundle = await getBundle(params.slug);
	const bundleBuffer = Buffer.from(await bundle.arrayBuffer());

	const runner = async ({
		stdout,
		stderr,
		signal,
	}: {
		stdout: Writable;
		stderr: Writable;
		signal: AbortSignal;
	}) => {
		const sandbox = await Sandbox.create({
			source: {
				type: "snapshot",
				snapshotId: "snap_Jhmuk7xWcnrQGk1czArYhzgtODcj",
			},
		});
		// await sandbox.writeFiles([{ path: "bundle.tar", content: bundleBuffer }]);

		// await sandbox.runCommand({
		// 	cmd: "npm",
		// 	args: ["install", "-g", "@google/gemini-cli"],
		// });

		// for (const install of manifest.install) {
		// 	await sandbox.runCommand({
		// 		cmd: install.cmd,
		// 		args: install.args ?? [],
		// 		env: install.env,
		// 	});
		// }

		await sandbox.runCommand({
			cmd: "gemini",
			args: [
				"-p",
				"Please tell me joke about React.js",
				"--output-format",
				"stream-json",
			],
			env: {
				GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
			},
			stdout,
			stderr,
			signal,
		});
	};

	return createSandboxStreamResponse(req, runner);
}
