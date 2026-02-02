import { Sandbox } from "@vercel/sandbox";
import { notFound } from "next/navigation";

export async function GET() {
	const sandbox = await Sandbox.get({
		sandboxId: "sbx_BY0Hr1CscfmT5by4T3nKNTyGjuHf",
	});
	if (!sandbox) {
		notFound();
	}

	const buffer = await sandbox.readFileToBuffer({
		path: "hello_world.pptx",
		cwd: "/vercel/sandbox/workspace",
	});
	if (!buffer) {
		notFound();
	}

	const headers = new Headers();
	headers.set("Content-Type", "application/octet-stream");
	headers.set("Content-Disposition", `attachment; filename="hello_world.pptx"`);
	headers.set("Content-Length", buffer.byteLength.toString());
	headers.set("Cache-Control", "no-store");

	return new Response(buffer, { status: 200, headers });
}
