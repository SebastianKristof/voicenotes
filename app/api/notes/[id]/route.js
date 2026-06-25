import { deleteNote, getNote, updateNote } from "../../../../lib/mvp-hub-repo";
import { getPublicErrorMessage, getStatusForError } from "../../../../lib/api-errors";

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
    const message = getPublicErrorMessage(error, "Failed to load note");
    const status = getStatusForError(error);
    return Response.json(
      { error: message },
      { status: message.includes("invalid note id") ? 400 : status === 503 ? 503 : 404 },
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
    const message = getPublicErrorMessage(error, "Failed to update note");
    const status = getStatusForError(error);
    return Response.json(
      { error: message },
      { status: status === 503 ? 503 : 400 },
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
    const message = getPublicErrorMessage(error, "Failed to delete note");
    const status = getStatusForError(error);
    return Response.json(
      { error: message },
      { status: message.includes("invalid note id") ? 400 : status },
    );
  }
}
