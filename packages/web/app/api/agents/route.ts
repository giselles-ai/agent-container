import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { agentManifestSchema } from "@/lib/agent/schema";
import { listManifests, putManifest } from "@/lib/agent/storage";

export async function GET(req: Request) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const token = process.env.BLOB_READ_WRITE_TOKEN;
	const manifests = await listManifests(token);
	return NextResponse.json({ agents: manifests });
}

export async function POST(req: Request) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const body = (await req.json().catch(() => null)) as unknown;
	const manifest = agentManifestSchema.parse(body);
	const token = process.env.BLOB_READ_WRITE_TOKEN;
	await putManifest(manifest.slug, manifest, token);
	return NextResponse.json({ ok: true });
}
