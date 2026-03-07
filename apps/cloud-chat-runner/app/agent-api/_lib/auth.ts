export class MissingServerConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MissingServerConfigError";
	}
}

export function getRequiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new MissingServerConfigError(
			`Missing required environment variable: ${name}`,
		);
	}
	return value;
}

export function getOptionalEnv(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value && value.length > 0 ? value : undefined;
}

export function extractBearerToken(request: Request): string | undefined {
	const header = request.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) {
		return undefined;
	}

	const token = header.slice(7).trim();
	return token.length > 0 ? token : undefined;
}

export function verifyApiToken(token: string): boolean {
	return token === getRequiredEnv("SANDBOX_AGENT_API_KEY");
}
