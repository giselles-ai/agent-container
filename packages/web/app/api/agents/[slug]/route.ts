import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { getManifest } from "@/lib/agent/storage";

type Params = {
	params: { slug: string };
};

export async function GET(req: Request, { params }: Params) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const token = process.env.BLOB_READ_WRITE_TOKEN;
	const manifest = await getManifest(params.slug, token);
	if (!manifest) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	return NextResponse.json(manifest);
}
