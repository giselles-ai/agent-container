import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { chat } from "@/db/schema/app-schema";
import { getAuth } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export default async function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const auth = getAuth();
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/signin");
	}

	const chats = await db
		.select({
			id: chat.id,
			publicId: chat.publicId,
			createdAt: chat.createdAt,
		})
		.from(chat)
		.where(eq(chat.userId, Number.parseInt(session.user.id, 10)))
		.orderBy(desc(chat.createdAt));

	return (
		<div className="flex h-screen bg-gray-950">
			<aside className="flex w-64 flex-col border-r border-gray-800 bg-gray-900">
				<div className="p-4">
					<Link
						href="/chats"
						className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
					>
						+ New Chat
					</Link>
				</div>

				<nav className="flex-1 overflow-y-auto px-2">
					<ul className="space-y-1">
						{chats.map((chatItem) => (
							<li key={chatItem.id}>
								<Link
									href={`/chats/${chatItem.publicId}`}
									className="block truncate rounded-lg px-3 py-2 text-sm text-gray-400 transition hover:bg-gray-800 hover:text-white"
								>
									Chat {chatItem.publicId.slice(0, 8)}...
								</Link>
							</li>
						))}
					</ul>
				</nav>

				<div className="border-t border-gray-800 p-4">
					<p className="truncate text-sm text-gray-400">{session.user.name}</p>
					<SignOutButton />
				</div>
			</aside>

			<main className="flex-1 overflow-hidden">{children}</main>
		</div>
	);
}
