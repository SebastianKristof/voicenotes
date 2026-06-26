import { createNote, listNotes } from "../../../lib/mvp-hub-repo";
import { getPublicErrorMessage, getStatusForError } from "../../../lib/api-errors";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const result = await listNotes({
      limit: searchParams.get("limit"),
      cursor: searchParams.get("cursor"),
      tag: searchParams.get("tag"),
      q: searchParams.get("q"),
    });
    return Response.json(result);
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
