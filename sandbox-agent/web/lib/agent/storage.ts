import {
	del,
	type ListBlobResult,
	type ListBlobResultBlob,
	list,
	put,
} from "@vercel/blob";
import {
	type AgentManifest,
	agentManifestSchema,
	type BuildMeta,
	buildMetaSchema,
} from "@/lib/agent/schema";

const MANIFEST_FILENAME = "manifest.json";
const BUILD_META_FILENAME = "meta.json";
const BLOB_HOST = process.env.BLOB_HOST ?? "";

function resolveManifestPath(slug: string) {
	return `agents/${slug}/${MANIFEST_FILENAME}`;
}

export function resolveManifestFullPath(slug: string) {
	return `${BLOB_HOST}/agents/${slug}/${MANIFEST_FILENAME}`;
}

export function resolveBundlePath(slug: string) {
	return `agents/${slug}/bundle.tar`;
}

export function resolveBundleFullPath(slug: string) {
	return `${BLOB_HOST}/agents/${slug}/bundle.tar`;
}

export function resolveBuildMetaPath(slug: string, snapshotId: string) {
	return `agents/${slug}/builds/${snapshotId}/${BUILD_META_FILENAME}`;
}

export function resolveBuildUploadsPrefix(slug: string, snapshotId: string) {
	return `agents/${slug}/builds/${snapshotId}/uploads/`;
}

export function resolveSkillPrefix(slug: string) {
	return `skills/${slug}/`;
}

export function resolveSkillFullPath(pathname: string) {
	return `${BLOB_HOST}/${pathname}`;
}

export async function putManifest(
	slug: string,
	manifest: AgentManifest,
	token?: string,
) {
	const pathname = resolveManifestPath(slug);
	await put(pathname, JSON.stringify(manifest, null, 2), {
		access: "public",
		addRandomSuffix: false,
		token,
		allowOverwrite: true,
		contentType: "application/json",
	});
}

export async function getManifest(slug: string) {
	const pathname = resolveManifestFullPath(slug);
	const blob = await fetch(pathname);
	if (!blob) {
		return null;
	}
	const jsonText = await blob.text();
	const data = JSON.parse(jsonText) as unknown;
	return agentManifestSchema.parse(data);
}

export async function listManifests(token?: string) {
	let results: ListBlobResult;
	try {
		results = await list({ prefix: "agents/", token });
	} catch {
		return [];
	}
	const manifests: AgentManifest[] = [];
	for (const blob of results.blobs) {
		if (!blob.pathname.endsWith(MANIFEST_FILENAME)) {
			continue;
		}
		const slug = blob.pathname.split("/")[1];
		if (!slug) continue;
		const manifest = await getManifest(slug);
		if (manifest) {
			manifests.push(manifest);
		}
	}
	return manifests;
}

export async function getBundle(slug: string) {
	const pathname = resolveBundleFullPath(slug);
	return await fetch(pathname);
}

export async function putBuildMeta(meta: BuildMeta, token?: string) {
	const pathname = resolveBuildMetaPath(meta.slug, meta.snapshotId);
	await put(pathname, JSON.stringify(meta, null, 2), {
		access: "public",
		addRandomSuffix: false,
		allowOverwrite: true,
		token,
		contentType: "application/json",
	});
}

export async function listBuildMetas(slug: string, token?: string) {
	const prefix = `agents/${slug}/builds/`;
	const metas: BuildMeta[] = [];
	let cursor: string | undefined;

	do {
		const result = await list({
			prefix,
			limit: 1000,
			cursor,
			token,
		});
		const metaBlobs = result.blobs.filter((blob) =>
			blob.pathname.endsWith(`/${BUILD_META_FILENAME}`),
		);
		for (const blob of metaBlobs) {
			const response = await fetch(blob.url);
			if (!response.ok) {
				continue;
			}
			const text = await response.text();
			try {
				const parsed = buildMetaSchema.parse(JSON.parse(text));
				metas.push(parsed);
			} catch {}
		}
		cursor = result.hasMore ? result.cursor : undefined;
	} while (cursor);

	return metas;
}

export async function deleteAgent(slug: string, token?: string) {
	const prefix = `agents/${slug}/`;
	let cursor: string | undefined;

	do {
		const result = await list({
			prefix,
			limit: 1000,
			cursor,
			token,
		});
		const urls = result.blobs.map((blob) => blob.url);
		if (urls.length > 0) {
			await del(urls, { token });
		}
		cursor = result.hasMore ? result.cursor : undefined;
	} while (cursor);
}

export async function listSkillFiles(slug: string, token?: string) {
	const prefix = resolveSkillPrefix(slug);
	const blobs: ListBlobResultBlob[] = [];
	let cursor: string | undefined;

	do {
		const result = await list({
			prefix,
			limit: 1000,
			cursor,
			token,
		});
		blobs.push(...result.blobs);
		cursor = result.hasMore ? result.cursor : undefined;
	} while (cursor);

	return blobs;
}

export async function getSkillFileText(pathname: string) {
	if (!BLOB_HOST) {
		return null;
	}
	const fullPath = resolveSkillFullPath(pathname);
	const response = await fetch(fullPath);
	if (!response.ok) {
		return null;
	}
	return await response.text();
}

export async function findHostedSkill(slug: string, token?: string) {
	const files = await listSkillFiles(slug, token);
	if (files.length === 0) {
		return null;
	}
	const skillPath = `${resolveSkillPrefix(slug)}SKILL.md`;
	const hasSkillMd = files.some((file) => file.pathname === skillPath);
	if (!hasSkillMd) {
		return null;
	}
	return { files };
}
