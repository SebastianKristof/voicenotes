import { createNote, listNotes } from "../../../lib/mvp-hub-repo";
import { getPublicErrorMessage, getStatusForError } from "../../../lib/api-errors";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const notes = await listNotes();
    return Response.json({ notes });
  } catch (error) {
    return Response.json(
      { error: getPublicErrorMessage(error, "Failed to load notes") },
      { status: getStatusForError(error) },
    );
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const note = await createNote(payload);
    const noteId = String(note?.id || "").trim();
    if (!UUID_RE.test(noteId)) {
      throw new Error("Failed to create note: server returned invalid id");
    }
    return Response.json({ note });
  } catch (error) {
    const message = getPublicErrorMessage(error, "Failed to create note");
    const status = getStatusForError(error);
    return Response.json(
      { error: message },
      { status: message.includes("invalid id") ? 500 : status === 503 ? 503 : 400 },
    );
  }
}
