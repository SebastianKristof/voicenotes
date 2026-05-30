import { createNotePost } from "../../../../../lib/mvp-hub-repo";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getValidId(params) {
  const id = String(params?.id || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error(`invalid note id: ${id || "<empty>"}`);
  }
  return id;
}

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const noteId = getValidId(resolvedParams);
    const payload = await request.json();
    const post = await createNotePost({ noteId, ...payload });
    return Response.json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save note post";
    return Response.json(
      { error: message },
      { status: 400 },
    );
  }
}
