import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import { resolveBaseURL } from "./base-url";

function createAuth() {
	const baseURL = resolveBaseURL();
	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite", // or "pg" or "mysql"
		}),
		baseURL,
		advanced: {
			database: {
				generateId: "serial",
			},
		},
	});
}

let cachedAuth: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
	if (cachedAuth) return cachedAuth;
	cachedAuth = createAuth();
	return cachedAuth;
}
