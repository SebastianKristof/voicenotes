import { ACCESS_COOKIE_NAME } from "../../../../lib/access-gate";
import { findAccessSessionByToken, listOpenAccessSessions } from "../../../../lib/access-session-repo";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const sessions = await listOpenAccessSessions();
    const currentToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value || "";
    const currentSession = await findAccessSessionByToken(currentToken).catch(() => null);
    const normalized = sessions.map((session) => ({
      ...session,
      current: currentSession ? session.id === currentSession.id : false,
    }));

    return Response.json({ sessions: normalized });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list sessions" },
      { status: 500 },
    );
  }
}
