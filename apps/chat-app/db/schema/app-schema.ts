import type { UIMessage } from "ai";
import { sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export const chat = sqliteTable("chat", {
	id: integer("id", { mode: "number" }).primaryKey({
		autoIncrement: true,
	}),
	publicId: text("public_id").notNull(),
	userId: integer("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date()),
});

export const message = sqliteTable(
	"message",
	{
		id: integer("id", { mode: "number" }).primaryKey({
			autoIncrement: true,
		}),
		publicId: text("public_id").notNull(),
		chatId: integer("chat_id")
			.notNull()
			.references(() => chat.id, { onDelete: "cascade" }),
		message: text("messages", { mode: "json" }).$type<UIMessage>().notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date()),
	},

	(table) => [uniqueIndex("chat_public_id_unique").on(table.publicId)],
);
