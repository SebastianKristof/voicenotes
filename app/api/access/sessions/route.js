import { ACCESS_COOKIE_NAME, validateLocalAccessToken } from "../../../../lib/access-gate";
import { findAccessSessionByToken, listOpenAccessSessions } from "../../../../lib/access-session-repo";

export const runtime = "nodejs";

export async function GET(request) {
  const currentToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value || "";

  try {
    const sessions = await listOpenAccessSessions();
    const currentSession = await findAccessSessionByToken(currentToken).catch(() => null);
    const normalized = sessions.map((session) => ({
      ...session,
      current: currentSession ? session.id === currentSession.id : false,
    }));

    return Response.json({ sessions: normalized });
  } catch (error) {
    const localSession = await validateLocalAccessToken(currentToken);
    if (localSession) {
      return Response.json({ sessions: [{ ...localSession, current: true }] });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list sessions" },
      { status: 500 },
    );
  }
}
