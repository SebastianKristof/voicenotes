import { getSupabaseAdmin } from "./supabase-admin";

const APP_SLUG = process.env.MVP_HUB_APP_SLUG || "voicenotes";
let cachedAppId = null;

function mustData(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}

export async function getAppId() {
  if (cachedAppId) return cachedAppId;

  const supabase = getSupabaseAdmin();
  const appResult = await supabase
    .from("mvp_hub.apps")
    .select("id")
    .eq("slug", APP_SLUG)
    .limit(1)
    .maybeSingle();

  if (appResult.error) {
    throw new Error(`Failed to load app ${APP_SLUG}: ${appResult.error.message}`);
  }

  if (appResult.data?.id) {
    cachedAppId = appResult.data.id;
    return cachedAppId;
  }

  const insertResult = await supabase
    .from("mvp_hub.apps")
    .insert({ slug: APP_SLUG, name: APP_SLUG })
    .select("id")
    .single();

  const inserted = mustData(insertResult, "Failed to create app");
  cachedAppId = inserted.id;
  return cachedAppId;
}

export async function listStyles() {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const result = await supabase
    .from("mvp_hub.styles")
    .select("id, name, instructions, created_at, updated_at")
    .eq("app_id", appId)
    .order("updated_at", { ascending: false });

  return mustData(result, "Failed to list styles");
}

export async function upsertStyle({ id, name, instructions }) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const payload = {
    app_id: appId,
    name: String(name || "").trim(),
    instructions: String(instructions || "").trim(),
  };

  if (!payload.name || !payload.instructions) {
    throw new Error("Style name and instructions are required");
  }

  if (id) {
    const result = await supabase
      .from("mvp_hub.styles")
      .update(payload)
      .eq("id", id)
      .eq("app_id", appId)
      .select("id, name, instructions, created_at, updated_at")
      .single();
    return mustData(result, "Failed to update style");
  }

  const result = await supabase
    .from("mvp_hub.styles")
    .insert(payload)
    .select("id, name, instructions, created_at, updated_at")
    .single();
  return mustData(result, "Failed to create style");
}

export async function deleteStyle(id) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const result = await supabase
    .from("mvp_hub.styles")
    .delete()
    .eq("id", id)
    .eq("app_id", appId);

  if (result.error) {
    throw new Error(`Failed to delete style: ${result.error.message}`);
  }
}

export async function createNote(payload) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const insertPayload = {
    app_id: appId,
    source_type: payload.sourceType || "manual",
    input_text: String(payload.inputText || "").trim(),
    dictated_text: payload.dictatedText || null,
    heading: payload.heading || null,
    summary: payload.summary || null,
    meta: payload.meta || {},
  };

  if (!insertPayload.input_text) {
    throw new Error("inputText is required");
  }

  const result = await supabase
    .from("mvp_hub.notes")
    .insert(insertPayload)
    .select("id, heading, summary, input_text, dictated_text, created_at, updated_at")
    .single();

  return mustData(result, "Failed to create note");
}

export async function updateNote(id, payload) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const updatePayload = {};
  if (payload.inputText !== undefined) updatePayload.input_text = payload.inputText;
  if (payload.dictatedText !== undefined) updatePayload.dictated_text = payload.dictatedText;
  if (payload.heading !== undefined) updatePayload.heading = payload.heading;
  if (payload.summary !== undefined) updatePayload.summary = payload.summary;
  if (payload.meta !== undefined) updatePayload.meta = payload.meta;

  const result = await supabase
    .from("mvp_hub.notes")
    .update(updatePayload)
    .eq("id", id)
    .eq("app_id", appId)
    .select("id, heading, summary, input_text, dictated_text, created_at, updated_at")
    .single();

  return mustData(result, "Failed to update note");
}

export async function listNotes() {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const result = await supabase
    .from("mvp_hub.notes")
    .select("id, heading, summary, input_text, dictated_text, created_at, updated_at")
    .eq("app_id", appId)
    .order("created_at", { ascending: false })
    .limit(100);

  return mustData(result, "Failed to list notes");
}

export async function getNote(id) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const noteResult = await supabase
    .from("mvp_hub.notes")
    .select("id, heading, summary, input_text, dictated_text, created_at, updated_at")
    .eq("id", id)
    .eq("app_id", appId)
    .single();

  const note = mustData(noteResult, "Failed to load note");

  const postsResult = await supabase
    .from("mvp_hub.note_posts")
    .select(
      "id, post_text, length, extra_instructions, style_id, style_name, style_instructions, generation_settings, created_at",
    )
    .eq("note_id", id)
    .eq("app_id", appId)
    .order("created_at", { ascending: false });

  const posts = mustData(postsResult, "Failed to load note posts");

  return { ...note, posts };
}

export async function createNotePost({
  noteId,
  postText,
  length,
  extraInstructions,
  styleId,
  styleName,
  styleInstructions,
  generationSettings,
}) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const payload = {
    app_id: appId,
    note_id: noteId,
    post_text: String(postText || "").trim(),
    length: length || "medium",
    extra_instructions: extraInstructions || null,
    style_id: styleId || null,
    style_name: styleName || null,
    style_instructions: styleInstructions || null,
    generation_settings: generationSettings || {},
  };

  if (!payload.post_text) {
    throw new Error("postText is required");
  }

  const result = await supabase
    .from("mvp_hub.note_posts")
    .insert(payload)
    .select(
      "id, post_text, length, extra_instructions, style_id, style_name, style_instructions, generation_settings, created_at",
    )
    .single();

  return mustData(result, "Failed to create note post");
}

export async function listSimilarNotes(noteId, limit = 5) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();
  const allResult = await supabase
    .from("mvp_hub.notes")
    .select("id, heading, summary, input_text, created_at")
    .eq("app_id", appId)
    .order("created_at", { ascending: false })
    .limit(300);

  const allNotes = mustData(allResult, "Failed to load notes for similarity");
  const base = allNotes.find((n) => n.id === noteId);
  if (!base) return [];

  const tokenize = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const baseTokens = new Set(
    tokenize(`${base.heading || ""} ${base.summary || ""} ${base.input_text || ""}`),
  );
  if (!baseTokens.size) return [];

  const scored = allNotes
    .filter((n) => n.id !== noteId)
    .map((n) => {
      const otherTokens = new Set(
        tokenize(`${n.heading || ""} ${n.summary || ""} ${n.input_text || ""}`),
      );
      if (!otherTokens.size) return { note: n, score: 0 };
      let intersection = 0;
      for (const token of otherTokens) {
        if (baseTokens.has(token)) intersection += 1;
      }
      const union = new Set([...baseTokens, ...otherTokens]).size;
      const score = union ? intersection / union : 0;
      return { note: n, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (a.note.created_at < b.note.created_at ? 1 : -1))
    .slice(0, Math.max(1, limit))
    .map((row) => ({
      note_id: row.note.id,
      heading: row.note.heading,
      summary: row.note.summary,
      similarity_score: row.score,
    }));

  return scored;
}
