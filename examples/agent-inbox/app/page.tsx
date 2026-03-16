import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export default async function Home() {
	const auth = getAuth();
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (session) {
		redirect("/chats");
	}

	redirect("/signin");
}
