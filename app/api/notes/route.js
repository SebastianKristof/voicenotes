import { createNote, listNotes } from "../../../lib/mvp-hub-repo";

export const runtime = "nodejs";

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
    return Response.json({ note });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create note" },
      { status: 400 },
    );
  }
}
