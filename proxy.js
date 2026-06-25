import { NextResponse } from "next/server";
import {
  ACCESS_API_PATH,
  ACCESS_COOKIE_NAME,
  ACCESS_NEXT_PARAM,
  ACCESS_PAGE_PATH,
  getRequiredAccessCode,
  validateLocalAccessToken,
} from "./lib/access-gate";
import { validateAndTouchAccessSession } from "./lib/access-session-repo";

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "";
}

function buildRedirectToAccess(request) {
  const url = request.nextUrl.clone();
  const nextPath = `${url.pathname}${url.search}`;
  url.pathname = ACCESS_PAGE_PATH;
  url.search = "";
  url.searchParams.set(ACCESS_NEXT_PARAM, nextPath);
  return NextResponse.redirect(url);
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname === ACCESS_PAGE_PATH || pathname === ACCESS_API_PATH) {
    return NextResponse.next();
  }

  if (process.env.PLAYWRIGHT_BYPASS_ACCESS === "1") {
    return NextResponse.next();
  }

  const requiredCode = getRequiredAccessCode();
  if (!requiredCode) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Access code is not configured on the server." }, { status: 503 });
    }
    return buildRedirectToAccess(request);
  }

  const sessionToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value || "";
  const session = await validateAndTouchAccessSession(sessionToken, {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") || "",
  }).catch(() => null);

  const localSession = session ? null : await validateLocalAccessToken(sessionToken);

  if (session || localSession) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized. Enter access code first." }, { status: 401 });
  }

  return buildRedirectToAccess(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
  ],
};
