import { type NextRequest, NextResponse } from "next/server";
import {
	GISELLE_PROTECTION_BYPASS_HEADER,
	GISELLE_PROTECTION_COOKIE_NAME,
	getProtectionPassword,
	hashSecret,
	isValidBypassHeader,
	sanitizeNextPath,
} from "./lib/protection";

const LOGIN_PATH = "/giselle-protection";
const LOGIN_API_PATH = "/api/giselle-protection/login";
const PROXY_DEBUG = (() => {
	const env = process.env.GISELLE_PROXY_DEBUG?.trim().toLowerCase();
	return env === "1" || env === "true" || env === "yes" || env === "on";
})();

function logProxy(message: string, detail?: unknown) {
	if (!PROXY_DEBUG) return;
	const suffix = detail === undefined ? "" : ` | ${JSON.stringify(detail)}`;
	process.stderr.write(`[proxy-debug] ${message}${suffix}\n`);
}

export async function proxy(request: NextRequest) {
	logProxy("proxy invoked", {
		method: request.method,
		pathname: request.nextUrl.pathname,
		search: request.nextUrl.search,
	});

	const protectionPassword = getProtectionPassword();
	logProxy("protection password configured", {
		present: Boolean(protectionPassword),
	});
	if (!protectionPassword) {
		logProxy("protection disabled");
		return NextResponse.next();
	}

	const { pathname, search } = request.nextUrl;
	logProxy("target path", {
		pathname,
		isApiRequest: pathname.startsWith("/api/"),
	});
	if (pathname === LOGIN_PATH || pathname === LOGIN_API_PATH) {
		logProxy("allow login path");
		return NextResponse.next();
	}

	const isApiRequest = pathname.startsWith("/api/");
	const bypassHeader = request.headers
		.get(GISELLE_PROTECTION_BYPASS_HEADER)
		?.trim();
	logProxy("bypass header", {
		name: GISELLE_PROTECTION_BYPASS_HEADER,
		hasHeader: Boolean(bypassHeader),
		length: bypassHeader?.length ?? 0,
		matches: bypassHeader === protectionPassword,
	});
	if (
		isApiRequest &&
		isValidBypassHeader(request.headers, protectionPassword)
	) {
		logProxy("api bypass ok");
		return NextResponse.next();
	}

	const expectedSession = await hashSecret(protectionPassword);
	logProxy("session expected", { exists: Boolean(expectedSession) });
	const sessionCookie = request.cookies.get(
		GISELLE_PROTECTION_COOKIE_NAME,
	)?.value;
	if (sessionCookie === expectedSession) {
		logProxy("session match");
		return NextResponse.next();
	}

	if (isApiRequest) {
		logProxy("api unauthorized", {
			hasSession: Boolean(sessionCookie),
			pathname,
			method: request.method,
		});
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
