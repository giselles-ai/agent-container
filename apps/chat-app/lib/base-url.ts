type BaseUrlEnv = Record<string, string | undefined>;

function readBaseURLEnv(): BaseUrlEnv {
	return {
		NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
		NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL:
			process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
		NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
		NEXT_PUBLIC_PORT: process.env.NEXT_PUBLIC_PORT,
		PORT: process.env.PORT,
	};
}

export function resolveBaseURL(env: BaseUrlEnv = readBaseURLEnv()): string {
	if (typeof window !== "undefined" && window.location?.origin) {
		return window.location.origin;
	}

	if (env.NEXT_PUBLIC_VERCEL_ENV === "production") {
		return `https://${env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`;
	}

	if (env.NEXT_PUBLIC_VERCEL_URL) {
		return `https://${env.NEXT_PUBLIC_VERCEL_URL}`;
	}

	const port = env.PORT ?? env.NEXT_PUBLIC_PORT ?? "3000";
	return `http://localhost:${port}`;
}
