import { Sandbox } from "@vercel/sandbox";
import { type NextRequest, NextResponse } from "next/server";

function safeFilename(path: string) {
	const name = path.split("/").pop() || "file";
	return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function GET(
	_: NextRequest,
	ctx: RouteContext<"/agents/pptx/chat/api/sandbox/[sandboxId]/artifact/[filepath]">,
) {
	const { sandboxId, filepath } = await ctx.params;
	const sandbox = await Sandbox.get({ sandboxId });
	const buffer = await sandbox.readFileToBuffer({
		path: filepath,
		cwd: "/vercel/sandbox",
	});
	if (!buffer) {
		return NextResponse.json({ error: "File not found" }, { status: 404 });
	}

	const headers = new Headers();
	headers.set("Content-Type", "application/octet-stream");
	headers.set(
		"Content-Disposition",
		`attachment; filename="${safeFilename(filepath)}"`,
	);
	headers.set("Content-Length", buffer.byteLength.toString());
	headers.set("Cache-Control", "no-store");
	const chunk = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(chunk);
			controller.close();
		},
	});
	return new Response(stream, { status: 200, headers });
}
