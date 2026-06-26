import { listTags } from "../../../lib/mvp-hub-repo";
import { getPublicErrorMessage, getStatusForError } from "../../../lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tags = await listTags();
    return Response.json({ tags });
  } catch (error) {
    return Response.json(
      { error: getPublicErrorMessage(error, "Failed to load tags") },
      { status: getStatusForError(error) },
    );
  }
}
