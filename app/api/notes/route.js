import { createNote, listNotes } from "../../../lib/mvp-hub-repo";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const notes = await listNotes();
    return Response.json({ notes });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load notes" },
      { status: 500 },
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
    const message = error instanceof Error ? error.message : "Failed to create note";
    return Response.json(
      { error: message },
      { status: message.includes("invalid id") ? 500 : 400 },
    );
  }
}
