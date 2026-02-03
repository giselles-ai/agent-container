import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { resolveBundlePath } from "@/lib/agent/storage";

type Params = {
	params: { slug: string };
};

export async function POST(req: Request, { params }: Params) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const bundlePath = resolveBundlePath(params.slug);
	const uploadUrl = `/api/agents/${params.slug}/bundle`;
	return NextResponse.json({
		uploadUrl,
		bundlePath,
		method: "PUT",
		headers: { "Content-Type": "application/octet-stream" },
	});
}
