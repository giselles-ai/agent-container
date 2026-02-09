import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { findHostedSkill } from "@/lib/agent/storage";

type Params = {
	params: Promise<{ slug: string }>;
};

function isValidSlug(slug: string) {
	return /^[a-z0-9-]+$/.test(slug);
}

export async function GET(req: Request, props: Params) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const params = await props.params;
	const slug = params.slug?.trim();
	if (!slug || !isValidSlug(slug)) {
		return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
	}

	const token = process.env.BLOB_READ_WRITE_TOKEN;
	const skill = await findHostedSkill(slug, token);
	if (!skill) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	return NextResponse.json({
		slug,
		files: skill.files.map((file) => ({ pathname: file.pathname })),
	});
}
