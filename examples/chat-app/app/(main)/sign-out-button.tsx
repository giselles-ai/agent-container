"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
	const router = useRouter();

	return (
		<button
			type="button"
			onClick={async () => {
				await authClient.signOut();
				router.push("/signin");
			}}
			className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-gray-500 transition hover:bg-gray-800 hover:text-gray-300"
		>
			Sign Out
		</button>
	);
}
