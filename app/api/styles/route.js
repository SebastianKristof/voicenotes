import { listStyles, upsertStyle } from "../../../lib/mvp-hub-repo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const styles = await listStyles();
    return Response.json({ styles });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load styles" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const { id, name, instructions } = await request.json();
    const style = await upsertStyle({ id, name, instructions });
    return Response.json({ style });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save style" },
      { status: 400 },
    );
  }
}
