import { get } from "@vercel/blob";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { getManifest } from "@/lib/agent/storage";
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

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const manifest = await getManifest(params.slug, token);
    if (!manifest) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

    const runner = async ({
		stdout,
		stderr,
		signal,
	}: {
		stdout: NodeJS.WritableStream;
		stderr: NodeJS.WritableStream;
		signal: AbortSignal;
	}) => {
		const sandbox = await Sandbox.create(
			manifest.runtime ? { runtime: manifest.runtime } : undefined,
		);

		const bundle = await get(manifest.bundlePath, { token });
		const bundleBuffer = Buffer.from(await bundle.arrayBuffer());
		await sandbox.writeFiles([{ path: "bundle.tar", content: bundleBuffer }]);

		await sandbox.runCommand({
			cmd: "tar",
			args: ["-xf", "bundle.tar"],
		});

		for (const install of manifest.install) {
			await sandbox.runCommand({
				cmd: install.cmd,
				args: install.args ?? [],
				env: install.env,
			});
		}

		return sandbox.runCommand({
			cmd: manifest.entrypoint.cmd,
			args: manifest.entrypoint.args ?? [],
			env: {
				...buildEnv(manifest.env),
				GISSELLE_PROMPT: prompt ?? "",
				...(manifest.entrypoint.env ?? {}),
			},
			stdout,
			stderr,
			signal,
		});
	};

    const format = new URL(req.url).searchParams.get("format");
    if (format === "sse") {
		return createSandboxSsePassthroughResponse(req, runner);
	}
    return createSandboxStreamResponse(req, runner);
}
