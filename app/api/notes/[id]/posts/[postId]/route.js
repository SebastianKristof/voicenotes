import { deleteNotePost, updateNotePost } from "../../../../../../lib/mvp-hub-repo";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getValidId(params, key, label) {
  const id = String(params?.[key] || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error(`invalid ${label}: ${id || "<empty>"}`);
  }
  return id;
}

export async function PATCH(request, { params }) {
  try {
    const resolvedParams = await params;
    const noteId = getValidId(resolvedParams, "id", "note id");
    const postId = getValidId(resolvedParams, "postId", "post id");
    const payload = await request.json();
    const post = await updateNotePost({ noteId, postId, postText: payload.postText });
    return Response.json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update note post";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const resolvedParams = await params;
    const noteId = getValidId(resolvedParams, "id", "note id");
    const postId = getValidId(resolvedParams, "postId", "post id");
    await deleteNotePost({ noteId, postId });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete note post";
    return Response.json({ error: message }, { status: message.includes("invalid") ? 400 : 500 });
  }
}
