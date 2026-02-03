import { NextResponse } from "next/server";

export function requireApiToken(req: Request) {
	const expected = process.env.GISSELLE_API_TOKEN;
	if (!expected) {
		return null;
	}
	const header = req.headers.get("authorization") ?? "";
	const token = header.replace(/^Bearer\s+/i, "");
	if (token !== expected) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	return null;
}
