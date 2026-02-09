import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const sanitizeFilename = (name: string) => {
	const trimmed = name.trim().replace(/[/\\\\]+/g, "_");
	const safe = trimmed.replace(/[^\w.\-+]+/g, "_");
	return safe.length > 0 ? safe : "file";
};

export async function POST(
	req: Request,
	ctx: RouteContext<"/agents/[slug]/snapshots/[snapshotId]/chat/api/upload">,
) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const formData = await req.formData().catch(() => null);
	if (!formData) {
		return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
	}

	const files = formData.getAll("files").filter((value): value is File => {
		return value instanceof File;
	});

	if (files.length === 0) {
		return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
	}

	if (files.length > MAX_FILES) {
		return NextResponse.json(
			{ error: `Too many files (max ${MAX_FILES}).` },
			{ status: 400 },
		);
	}

	for (const file of files) {
		if (file.size > MAX_FILE_SIZE) {
			return NextResponse.json(
				{ error: `File too large: ${file.name}` },
				{ status: 400 },
			);
		}
	}

	const token = process.env.BLOB_READ_WRITE_TOKEN;
	const { slug, snapshotId } = await ctx.params;
	const timestamp = Date.now();
	const uploaded = await Promise.all(
		files.map(async (file, index) => {
			const safeName = sanitizeFilename(file.name);
			const pathname = `agents/${slug}/builds/${snapshotId}/uploads/${timestamp}/${index}-${safeName}`;
			const body = await file.arrayBuffer();
			const blob = await put(pathname, body, {
				access: "public",
				addRandomSuffix: false,
				allowOverwrite: false,
				token,
				contentType: file.type || "application/octet-stream",
			});
			return {
				name: file.name,
				size: file.size,
				type: file.type,
				pathname: blob.pathname,
				url: blob.url,
			};
		}),
	);

	return NextResponse.json({ files: uploaded });
}
