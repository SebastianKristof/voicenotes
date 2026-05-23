import { deleteStyle } from "../../../../lib/mvp-hub-repo";

export const runtime = "nodejs";

export async function DELETE(_request, { params }) {
  try {
    await deleteStyle(params.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete style" },
      { status: 400 },
    );
  }
}
