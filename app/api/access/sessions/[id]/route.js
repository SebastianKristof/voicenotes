import { NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, validateLocalAccessToken } from "../../../../../lib/access-gate";
import { findAccessSessionByToken, terminateAccessSessionById } from "../../../../../lib/access-session-repo";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
  try {
    const resolvedParams = await params;
    const sessionId = String(resolvedParams?.id || "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "Session id is required" }, { status: 400 });
    }

    const currentCookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value || "";
    if (sessionId === "local" && await validateLocalAccessToken(currentCookie)) {
      const response = NextResponse.json({ ok: true });
      response.cookies.delete(ACCESS_COOKIE_NAME);
      return response;
    }

    const currentSession = await findAccessSessionByToken(currentCookie).catch(() => null);
    await terminateAccessSessionById(sessionId);

    const response = NextResponse.json({ ok: true });
    if (currentSession && currentSession.id === sessionId) {
      response.cookies.delete(ACCESS_COOKIE_NAME);
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to terminate session" },
      { status: 400 },
    );
  }
}
