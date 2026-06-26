import { getSupabaseAdmin } from "./supabase-admin";
import { DEFAULT_TAGS, mergeTagSlugs, normalizeTagInput, suggestTagSlugs } from "./note-tags";

const APP_SLUG = process.env.MVP_HUB_APP_SLUG || "voicenotes";
let cachedAppId = null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_STYLES = [
  {
    name: "LinkedIn эксперт",
    instructions:
      "Пиши как опытный эксперт для LinkedIn: четкий хук в первой строке, практичные выводы, короткие абзацы, уверенный тон, без воды.",
  },
  {
    name: "X / короткий",
    instructions:
      "Сформулируй коротко и остро для X: 1 главная мысль, 2-4 коротких тезиса, разговорный стиль, высокая плотность смысла.",
  },
  {
    name: "Founder update",
    instructions:
      "Пиши как фаундер: что попробовали, что сработало, что не сработало, чему научились, что делаем дальше. Прямо и конкретно.",
  },
  {
    name: "Обучающий пост",
    instructions:
      "Сделай обучающий пост: проблема -> шаги решения -> типичные ошибки -> короткий итог. Дай читателю готовый план действий.",
  },
];

const NOTE_SELECT =
  "id, heading, summary, input_text, dictated_text, meta, created_at, updated_at, note_tags(tags(id, slug, name))";

function mustData(result, context) {
  if (result.error) {
    const message = result.error.message || "Unknown Supabase error";
    if (
      message.includes("schema cache") ||
      message.includes("The schema must be one of the following")
    ) {
      throw new Error(
        `${context}: ${message}. Ensure schema "mvp_hub" is added to Supabase Data API Exposed Schemas.`,
      );
    }
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}

function inHub(supabase) {
  return supabase.schema("mvp_hub");
}

function normalizeLimit(value, fallback = 40) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

function encodeCursor(note) {
  if (!note?.created_at || !note?.id) return "";
  return Buffer.from(`${note.created_at}|${note.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const [createdAt, id] = Buffer.from(String(cursor), "base64url").toString("utf8").split("|");
    return createdAt && id ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

function normalizeNote(row) {
  const tags = Array.isArray(row?.note_tags)
    ? row.note_tags.map((item) => item.tags).filter(Boolean)
    : [];
  const { note_tags: _noteTags, ...note } = row;
  return { ...note, tags };
}

async function ensureDefaultTags(supabase, appId) {
  const payload = DEFAULT_TAGS.map((tag) => ({
    app_id: appId,
    slug: tag.slug,
    name: tag.name,
  }));

  const result = await inHub(supabase)
    .from("tags")
    .upsert(payload, { onConflict: "app_id,slug", ignoreDuplicates: true });

  if (result.error) {
    throw new Error(`Failed to seed default tags: ${result.error.message}`);
  }
}

export async function listTags() {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();
  await ensureDefaultTags(supabase, appId);

  const result = await inHub(supabase)
    .from("tags")
    .select("id, slug, name")
    .eq("app_id", appId)
    .order("name", { ascending: true });

  return mustData(result, "Failed to list tags");
}

async function getOrCreateTags(supabase, appId, inputs) {
  const normalized = inputs
    .map((value) => {
      if (typeof value === "string") return normalizeTagInput(value);
      const slug = String(value?.slug || "").trim();
      const name = String(value?.name || slug).trim();
      return slug && name ? { slug, name } : null;
    })
    .filter(Boolean);

  if (!normalized.length) return [];

  const payload = normalized.map((tag) => ({ app_id: appId, slug: tag.slug, name: tag.name }));
  const upsertResult = await inHub(supabase)
    .from("tags")
    .upsert(payload, { onConflict: "app_id,slug", ignoreDuplicates: true });

  if (upsertResult.error) {
    throw new Error(`Failed to save tags: ${upsertResult.error.message}`);
  }

  const result = await inHub(supabase)
    .from("tags")
    .select("id, slug, name")
    .eq("app_id", appId)
    .in("slug", normalized.map((tag) => tag.slug));

  return mustData(result, "Failed to load tags");
}

async function replaceNoteTags(supabase, appId, noteId, tagSlugs = []) {
  const deleteResult = await inHub(supabase)
    .from("note_tags")
    .delete()
    .eq("app_id", appId)
    .eq("note_id", noteId);

  if (deleteResult.error) {
    throw new Error(`Failed to replace note tags: ${deleteResult.error.message}`);
  }

  const tags = await getOrCreateTags(supabase, appId, tagSlugs);
  if (!tags.length) return [];

  const insertResult = await inHub(supabase)
    .from("note_tags")
    .insert(tags.map((tag) => ({ app_id: appId, note_id: noteId, tag_id: tag.id })));

  if (insertResult.error) {
    throw new Error(`Failed to attach note tags: ${insertResult.error.message}`);
  }

  return tags;
}

export async function getAppId() {
  if (cachedAppId) return cachedAppId;

  const supabase = getSupabaseAdmin();
  const appResult = await inHub(supabase)
    .from("apps")
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

  const insertResult = await inHub(supabase)
    .from("apps")
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

  const listResult = await inHub(supabase)
    .from("styles")
    .select("id, name, instructions, created_at, updated_at")
    .eq("app_id", appId)
    .order("updated_at", { ascending: false });

  const existing = mustData(listResult, "Failed to list styles");
  const names = new Set(existing.map((style) => String(style.name || "").trim()));
  const missing = DEFAULT_STYLES.filter((style) => !names.has(style.name));

  if (missing.length) {
    const seedPayload = missing.map((style) => ({
      app_id: appId,
      name: style.name,
      instructions: style.instructions,
    }));

    const seedResult = await inHub(supabase)
      .from("styles")
      .upsert(seedPayload, { onConflict: "app_id,name", ignoreDuplicates: true });

    if (seedResult.error) {
      throw new Error(`Failed to seed default styles: ${seedResult.error.message}`);
    }

    const refreshedResult = await inHub(supabase)
      .from("styles")
      .select("id, name, instructions, created_at, updated_at")
      .eq("app_id", appId)
      .order("updated_at", { ascending: false });

    return mustData(refreshedResult, "Failed to list styles");
  }

  return existing;
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
    const result = await inHub(supabase)
      .from("styles")
      .update(payload)
      .eq("id", id)
      .eq("app_id", appId)
      .select("id, name, instructions, created_at, updated_at")
      .single();
    return mustData(result, "Failed to update style");
  }

  const result = await inHub(supabase)
    .from("styles")
    .insert(payload)
    .select("id, name, instructions, created_at, updated_at")
    .single();
  return mustData(result, "Failed to create style");
}

export async function deleteStyle(id) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const result = await inHub(supabase)
    .from("styles")
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
  await ensureDefaultTags(supabase, appId);

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

  const result = await inHub(supabase)
    .from("notes")
    .insert(insertPayload)
    .select("id, heading, summary, input_text, dictated_text, meta, created_at, updated_at")
    .single();

  const note = mustData(result, "Failed to create note");
  const noteId = String(note?.id || "").trim();
  if (!UUID_RE.test(noteId)) {
    throw new Error("Failed to create note: inserted row has invalid id");
  }
  const requestedTags = Array.isArray(payload.tagSlugs) ? payload.tagSlugs : [];
  const suggestedTags = suggestTagSlugs(insertPayload, DEFAULT_TAGS);
  const tags = await replaceNoteTags(supabase, appId, noteId, mergeTagSlugs(requestedTags, suggestedTags));
  return { ...note, tags };
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

  const result = await inHub(supabase)
    .from("notes")
    .update(updatePayload)
    .eq("id", id)
    .eq("app_id", appId)
    .select("id, heading, summary, input_text, dictated_text, meta, created_at, updated_at")
    .single();

  const note = mustData(result, "Failed to update note");
  if (Array.isArray(payload.tagSlugs)) {
    const tags = await replaceNoteTags(supabase, appId, id, payload.tagSlugs);
    return { ...note, tags };
  }
  return note;
}

export async function deleteNote(id) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const result = await inHub(supabase)
    .from("notes")
    .delete()
    .eq("id", id)
    .eq("app_id", appId);

  if (result.error) {
    throw new Error(`Failed to delete note: ${result.error.message}`);
  }
}

export async function listNotes({ limit, cursor, tag, q } = {}) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();
  await ensureDefaultTags(supabase, appId);

  const pageSize = normalizeLimit(limit);
  const decodedCursor = decodeCursor(cursor);
  let noteIdsForTag = null;

  if (tag) {
    const tagResult = await inHub(supabase)
      .from("tags")
      .select("id")
      .eq("app_id", appId)
      .eq("slug", tag)
      .maybeSingle();
    const tagRow = mustData(tagResult, "Failed to load tag filter");
    if (!tagRow?.id) return { notes: [], nextCursor: "" };

    const noteTagsResult = await inHub(supabase)
      .from("note_tags")
      .select("note_id")
      .eq("app_id", appId)
      .eq("tag_id", tagRow.id);
    noteIdsForTag = mustData(noteTagsResult, "Failed to load tagged notes").map((row) => row.note_id);
    if (!noteIdsForTag.length) return { notes: [], nextCursor: "" };
  }

  let query = inHub(supabase)
    .from("notes")
    .select(NOTE_SELECT)
    .eq("app_id", appId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (decodedCursor) {
    query = query.or(`created_at.lt.${decodedCursor.createdAt},and(created_at.eq.${decodedCursor.createdAt},id.lt.${decodedCursor.id})`);
  }
  if (noteIdsForTag) {
    query = query.in("id", noteIdsForTag);
  }
  if (q) {
    const term = String(q).replace(/[%_]/g, "\\$&");
    query = query.or(`heading.ilike.%${term}%,summary.ilike.%${term}%,input_text.ilike.%${term}%`);
  }

  const result = await query;
  const rows = mustData(result, "Failed to list notes");
  const pageRows = rows.slice(0, pageSize);
  const nextCursor = rows.length > pageSize ? encodeCursor(pageRows[pageRows.length - 1]) : "";

  return { notes: pageRows.map(normalizeNote), nextCursor };
}

export async function getNote(id) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const noteResult = await inHub(supabase)
    .from("notes")
    .select(NOTE_SELECT)
    .eq("id", id)
    .eq("app_id", appId)
    .single();

  const note = normalizeNote(mustData(noteResult, "Failed to load note"));

  const postsResult = await inHub(supabase)
    .from("note_posts")
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

  const result = await inHub(supabase)
    .from("note_posts")
    .insert(payload)
    .select(
      "id, post_text, length, extra_instructions, style_id, style_name, style_instructions, generation_settings, created_at",
    )
    .single();

  return mustData(result, "Failed to create note post");
}

export async function updateNotePost({ noteId, postId, postText }) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();
  const text = String(postText || "").trim();

  if (!text) {
    throw new Error("postText is required");
  }

  const result = await inHub(supabase)
    .from("note_posts")
    .update({ post_text: text })
    .eq("id", postId)
    .eq("note_id", noteId)
    .eq("app_id", appId)
    .select(
      "id, post_text, length, extra_instructions, style_id, style_name, style_instructions, generation_settings, created_at",
    )
    .single();

  return mustData(result, "Failed to update note post");
}

export async function deleteNotePost({ noteId, postId }) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const result = await inHub(supabase)
    .from("note_posts")
    .delete()
    .eq("id", postId)
    .eq("note_id", noteId)
    .eq("app_id", appId);

  if (result.error) {
    throw new Error(`Failed to delete note post: ${result.error.message}`);
  }
}

export async function listSimilarNotes(noteId, limit = 5) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();
  const allResult = await inHub(supabase)
    .from("notes")
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
