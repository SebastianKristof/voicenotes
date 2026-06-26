const CACHE_KEY = "voicenotes.notes.cache.v1";
const CACHE_TTL_MS = 60 * 1000;

function now() {
  return Date.now();
}

export function readNotesCache() {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!parsed || !Array.isArray(parsed.notes)) return null;
    return {
      notes: parsed.notes,
      nextCursor: parsed.nextCursor || "",
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

export function writeNotesCache(notes, nextCursor = "") {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ notes, nextCursor, savedAt: now() }));
  } catch {}
}

export function isNotesCacheFresh(cache) {
  return !!cache?.savedAt && now() - cache.savedAt < CACHE_TTL_MS;
}

export function mergeNotePages(current, incoming) {
  const byId = new Map();
  for (const note of [...current, ...incoming]) {
    if (note?.id) byId.set(note.id, note);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const byDate = String(b.created_at || "").localeCompare(String(a.created_at || ""));
    if (byDate) return byDate;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}
