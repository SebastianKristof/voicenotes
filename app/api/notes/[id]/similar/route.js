import { listSimilarNotes } from "../../../../../lib/mvp-hub-repo";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getValidId(params) {
  const id = String(params?.id || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error(`invalid note id: ${id || "<empty>"}`);
  }
  return id;
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const noteId = getValidId(resolvedParams);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 5);
    const similar = await listSimilarNotes(noteId, limit);
    return Response.json({ similar });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load similar notes";
    return Response.json(
      { error: message },
      { status: 400 },
    );
  }
}
