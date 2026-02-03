import { list, put } from "@vercel/blob";
import { type AgentManifest, agentManifestSchema } from "@/lib/agent/schema";

const MANIFEST_FILENAME = "manifest.json";
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
	let results;
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
