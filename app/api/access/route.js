import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  buildAccessCookieOptions,
  createLocalAccessToken,
  getRequiredAccessCode,
  isValidAccessCode,
} from "../../../lib/access-gate";
import { createAccessSession, terminateAccessSessionByToken } from "../../../lib/access-session-repo";

function isConfigured() {
  return Boolean(getRequiredAccessCode());
}

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "";
}

export async function POST(request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Access code is not configured on the server." }, { status: 500 });
  }

  const payload = await request.json().catch(() => ({}));
  const code = typeof payload?.code === "string" ? payload.code : "";

  if (!isValidAccessCode(code)) {
    return NextResponse.json({ error: "Invalid code." }, { status: 401 });
  }

  let token = "";
  try {
    const session = await createAccessSession({
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent") || "",
    });
    token = session.token;
  } catch (error) {
    console.error(
      "Failed to create database-backed access session; falling back to signed local token.",
      error,
    );
    token = await createLocalAccessToken();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE_NAME, token, buildAccessCookieOptions());
  return response;
}

export async function DELETE(request) {
  const token = request.cookies.get(ACCESS_COOKIE_NAME)?.value || "";
  await terminateAccessSessionByToken(token).catch(() => {});
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ACCESS_COOKIE_NAME);
  return response;
}
