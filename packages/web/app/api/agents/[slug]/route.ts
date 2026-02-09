import { Snapshot } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";
import { deleteAgent, listBuildMetas } from "@/lib/agent/storage";

function isValidSlug(slug: string) {
	return /^[a-z0-9-]+$/.test(slug);
}

export async function DELETE(
	req: Request,
	ctx: RouteContext<"/api/agents/[slug]">,
) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const { slug } = await ctx.params;
	if (!slug || !isValidSlug(slug)) {
		return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
	}

	const token = process.env.BLOB_READ_WRITE_TOKEN;
	const buildMetas = await listBuildMetas(slug, token);

	for (const meta of buildMetas) {
		try {
			const snapshot = await Snapshot.get({ snapshotId: meta.snapshotId });
			await snapshot.delete();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(
				`Failed to delete snapshot ${meta.snapshotId} for ${slug}: ${message}`,
			);
		}
	}

	await deleteAgent(slug, token);
	return NextResponse.json({ ok: true });
}
