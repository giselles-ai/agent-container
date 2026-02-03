import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { resolveBundlePath } from "@/lib/agent/storage";

type Params = {
	params: Promise<{ slug: string }>;
};

export async function POST(req: Request, props: Params) {
	const params = await props.params;
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
