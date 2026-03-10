import { drizzle } from "drizzle-orm/libsql";
import { appRelations, authRelations } from "./relations";
import * as appSchema from "./schema/app-schema";
import * as authSchema from "./schema/auth-schema";

export const db = drizzle({
	connection: {
		url: process.env.DATABASE_URL ?? "",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	},
	schema: {
		...appSchema,
		...authSchema,
	},
	relations: {
		...authRelations,
		...appRelations,
	},
});
