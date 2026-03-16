import { defineRelations } from "drizzle-orm";
import * as appSchema from "../schema/app-schema";
import * as authSchema from "../schema/auth-schema";

export const appRelations = defineRelations(
	{ ...appSchema, ...authSchema },
	(r) => ({
		chat: {
			user: r.one.user({
				from: r.chat.userId,
				to: r.user.id,
			}),
			messages: r.many.message({
				from: r.chat.id,
				to: r.message.chatId,
			}),
		},
		messages: {
			chat: r.one.chat({
				from: r.message.chatId,
				to: r.chat.id,
			}),
		},
	}),
);
