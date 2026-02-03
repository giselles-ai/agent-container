import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { resolveBundlePath } from "@/lib/agent/storage";

type Params = {
	params: Promise<{ slug: string }>;
};

export async function PUT(req: Request, props: Params) {
    const params = await props.params;
    const authError = requireApiToken(req);
    if (authError) return authError;

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const bundlePath = resolveBundlePath(params.slug);
    const body = await req.arrayBuffer();
    await put(bundlePath, body, {
		access: "public",
		addRandomSuffix: false,
		token,
		allowOverwrite: true,
		contentType: "application/octet-stream",
	});
    return NextResponse.json({ ok: true, bundlePath });
}
