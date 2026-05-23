import { getNote, updateNote } from "../../../../lib/mvp-hub-repo";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const note = await getNote(params.id);
    return Response.json({ note });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load note" },
      { status: 404 },
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const payload = await request.json();
    const note = await updateNote(params.id, payload);
    return Response.json({ note });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update note" },
      { status: 400 },
    );
  }
}
