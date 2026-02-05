import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(
	_req: NextRequest,
	ctx: RouteContext<"/agents/sandbox/[id]/command">,
) {
	const { id } = await ctx.params;
	const sandbox = await Sandbox.get({ sandboxId: id });

	let output = "";
	const r = await sandbox.runCommand({
		cmd: "find",
		args: [".", "-type", "f", "-maxdepth", "2"],
		cwd: "/vercel/sandbox",
		stdout: new Writable({
			write(chunk, _encoding, callback) {
				output += typeof chunk === "string" ? chunk : chunk.toString("utf8");
				if (typeof chunk === "object") {
					const decoder = new TextDecoder();
					console.log(decoder.decode(chunk));
				}
				callback();
			},
		}),
		stderr: new Writable({
			write(chunk, _encoding, callback) {
				const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
				console.log(`err: ${text}`);
				callback();
			},
		}),
	});
	console.log(JSON.stringify(r));
	return NextResponse.json({ output });
}
