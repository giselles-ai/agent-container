import { type NextRequest, NextResponse } from "next/server";
import {
	GISELLE_PROTECTION_COOKIE_NAME,
	getProtectionPassword,
	hashSecret,
	isValidBypassHeader,
	sanitizeNextPath,
} from "./lib/protection";

const LOGIN_PATH = "/giselle-protection";
const LOGIN_API_PATH = "/api/giselle-protection/login";

export async function proxy(request: NextRequest) {
	// Bypass protection in local dev where VERCEL_ENV is not defined.
	if (!process.env.VERCEL_ENV) {
		return NextResponse.next();
	}

	const protectionPassword = getProtectionPassword();
	if (!protectionPassword) {
		return NextResponse.next();
	}

	const { pathname, search } = request.nextUrl;
	if (pathname === LOGIN_PATH || pathname === LOGIN_API_PATH) {
		return NextResponse.next();
	}

	console.log(pathname);
	const isAgentApiRequest = pathname.startsWith("/agent-api");
	if (isAgentApiRequest) {
		return NextResponse.next();
	}

	const isApiRequest = pathname.startsWith("/api/");

	if (
		isApiRequest &&
		isValidBypassHeader(request.headers, protectionPassword)
	) {
		return NextResponse.next();
	}

	const expectedSession = await hashSecret(protectionPassword);
	const sessionCookie = request.cookies.get(
		GISELLE_PROTECTION_COOKIE_NAME,
	)?.value;
	if (sessionCookie === expectedSession) {
		return NextResponse.next();
	}

	if (isApiRequest) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const nextPath = sanitizeNextPath(`${pathname}${search}`);
	const redirectUrl = request.nextUrl.clone();
	redirectUrl.pathname = LOGIN_PATH;
	redirectUrl.search = "";
	redirectUrl.searchParams.set("next", nextPath);

	return NextResponse.redirect(redirectUrl);
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
	],
};
