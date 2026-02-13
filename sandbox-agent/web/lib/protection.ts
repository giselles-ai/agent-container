const HASH_PREFIX = "giselle-protection:v1:";

export const GISELLE_PROTECTION_COOKIE_NAME = "giselle_protection_session";
export const GISELLE_PROTECTION_BYPASS_HEADER = "x-giselle-protection-bypass";

export function getProtectionPassword(): string | null {
	const value = process.env.GISELLE_PROTECTION_PASSWORD?.trim();
	return value && value.length > 0 ? value : null;
}

export async function hashSecret(secret: string): Promise<string> {
	const source = `${HASH_PREFIX}${secret}`;
	const encoded = new TextEncoder().encode(source);
	const digest = await crypto.subtle.digest("SHA-256", encoded);
	const bytes = new Uint8Array(digest);
	return toBase64Url(bytes);
}

export function isValidBypassHeader(headers: Headers, secret: string): boolean {
	const candidate = headers.get(GISELLE_PROTECTION_BYPASS_HEADER)?.trim();
	return Boolean(candidate) && candidate === secret;
}

export function sanitizeNextPath(raw: string | null | undefined): string {
	if (!raw) {
		return "/";
	}

	const value = raw.trim();
	if (!value.startsWith("/") || value.startsWith("//")) {
		return "/";
	}

	return value;
}

function toBase64Url(bytes: Uint8Array): string {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(bytes).toString("base64url");
	}

	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
