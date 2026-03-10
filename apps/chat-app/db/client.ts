import { drizzle } from "drizzle-orm/libsql";
import { authRelations } from "./relations";
import * as schema from "./schemas";

export const db = drizzle({
	connection: {
		url: process.env.DATABASE_URL ?? "",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	},
	schema,
	relations: {
		...authRelations,
	},
});
