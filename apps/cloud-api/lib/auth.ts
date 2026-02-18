export type VerifyApiKeyResult =
	| { ok: true }
	| {
			ok: false;
			status: number;
			errorCode: string;
			message: string;
	  };

function extractBearerToken(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) {
		return null;
	}

	const trimmed = authorizationHeader.trim();
	if (!trimmed) {
		return null;
	}

	if (/^bearer\s+/i.test(trimmed)) {
		const token = trimmed.replace(/^bearer\s+/i, "").trim();
		return token || null;
	}

	return trimmed;
}

function parseStaticApiKeys(value: string | undefined): string[] {
	if (!value) {
		return [];
	}

	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export async function verifyApiKey(request: Request): Promise<VerifyApiKeyResult> {
	const token = extractBearerToken(request.headers.get("authorization"));
	if (!token) {
		return {
			ok: false,
			status: 401,
			errorCode: "UNAUTHORIZED",
			message: "Missing API key. Provide Authorization: Bearer <API_KEY>.",
		};
	}

	const verifierEndpoint = process.env.GISELLE_CLOUD_API_ENDPOINT?.trim();
	if (verifierEndpoint) {
		try {
			const response = await fetch(verifierEndpoint, {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
				},
				cache: "no-store",
			});

			if (response.ok) {
				return { ok: true };
			}

			if (response.status === 401 || response.status === 403) {
				return {
					ok: false,
					status: 401,
					errorCode: "UNAUTHORIZED",
					message: "Invalid API key.",
				};
			}

			return {
				ok: false,
				status: 503,
				errorCode: "AUTH_UNAVAILABLE",
				message: `API key verifier failed with HTTP ${response.status}.`,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to reach API key verifier.";
			return {
				ok: false,
				status: 503,
				errorCode: "AUTH_UNAVAILABLE",
				message,
			};
		}
	}

	const staticKeys = parseStaticApiKeys(process.env.GISELLE_CLOUD_STATIC_API_KEYS);
	if (staticKeys.length === 0) {
		return {
			ok: false,
			status: 500,
			errorCode: "AUTH_MISCONFIGURED",
			message:
				"API key validation is not configured. Set GISELLE_CLOUD_API_ENDPOINT or GISELLE_CLOUD_STATIC_API_KEYS.",
		};
	}

	if (!staticKeys.includes(token)) {
		return {
			ok: false,
			status: 401,
			errorCode: "UNAUTHORIZED",
			message: "Invalid API key.",
		};
	}

	return { ok: true };
}
