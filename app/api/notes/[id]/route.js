import { deleteNote, getNote, updateNote } from "../../../../lib/mvp-hub-repo";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getValidId(params) {
  const id = String(params?.id || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error(`invalid note id: ${id || "<empty>"}`);
  }
  return id;
}

export async function GET(_request, { params }) {
  try {
    const resolvedParams = await params;
    const noteId = getValidId(resolvedParams);
    const note = await getNote(noteId);
    return Response.json({ note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load note";
    return Response.json(
      { error: message },
      { status: message.includes("invalid note id") ? 400 : 404 },
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const resolvedParams = await params;
    const noteId = getValidId(resolvedParams);
    const payload = await request.json();
    const note = await updateNote(noteId, payload);
    return Response.json({ note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update note";
    return Response.json(
      { error: message },
      { status: 400 },
    );
  }
}

export async function DELETE(_request, { params }) {
  try {
    const resolvedParams = await params;
    const noteId = getValidId(resolvedParams);
    await deleteNote(noteId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete note";
    return Response.json(
      { error: message },
      { status: message.includes("invalid note id") ? 400 : 500 },
    );
  }
}
