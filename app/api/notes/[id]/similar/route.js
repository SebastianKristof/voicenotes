import { listSimilarNotes } from "../../../../../lib/mvp-hub-repo";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 5);
    const similar = await listSimilarNotes(params.id, limit);
    return Response.json({ similar });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load similar notes" },
      { status: 400 },
    );
  }
}
