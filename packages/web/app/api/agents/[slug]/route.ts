import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { getManifest } from "@/lib/agent/storage";

type Params = {
	params: Promise<{ slug: string }>;
};

export async function GET(req: Request, props: Params) {
    const params = await props.params;
    const authError = requireApiToken(req);
    if (authError) return authError;

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const manifest = await getManifest(params.slug, token);
    if (!manifest) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
    return NextResponse.json(manifest);
}
