import { createNotePost } from "../../../../../lib/mvp-hub-repo";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const payload = await request.json();
    const post = await createNotePost({ noteId: params.id, ...payload });
    return Response.json({ post });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save note post" },
      { status: 400 },
    );
  }
}
