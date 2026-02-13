import { NextResponse } from "next/server";
import {
  GISELLE_PROTECTION_COOKIE_NAME,
  getProtectionPassword,
  hashSecret,
  sanitizeNextPath
} from "@/lib/protection";

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

function toStringValue(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const nextPath = sanitizeNextPath(toStringValue(formData?.get("next") ?? null));
  const redirectTarget = new URL(nextPath, request.url);

  const protectionPassword = getProtectionPassword();
  if (!protectionPassword) {
    return NextResponse.redirect(redirectTarget);
  }

  const submittedPassword = toStringValue(formData?.get("password") ?? null)?.trim() ?? "";

  if (submittedPassword !== protectionPassword) {
    const retryUrl = new URL("/giselle-protection", request.url);
    retryUrl.searchParams.set("error", "1");
    retryUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(retryUrl);
  }

  const response = NextResponse.redirect(redirectTarget);
  response.cookies.set({
    name: GISELLE_PROTECTION_COOKIE_NAME,
    value: await hashSecret(protectionPassword),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_WEEK_SECONDS
  });

  return response;
}
