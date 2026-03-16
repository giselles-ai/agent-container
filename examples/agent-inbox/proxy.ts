import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
	const sessionCookie = getSessionCookie(request);

	if (!sessionCookie) {
		return NextResponse.redirect(new URL("/signin", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/chats/:path*", "/api/chat/:path*"],
};
