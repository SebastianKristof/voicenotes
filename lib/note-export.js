function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

export const EXPORT_SEPARATORS = {
  blank: "\n\n",
  rule: "\n\n---\n\n",
};

export function formatNoteForExport(note) {
  const lines = [];
  const heading = note.heading || "Без заголовка";
  const tags = Array.isArray(note.tags) ? note.tags.map((tag) => tag.name).filter(Boolean) : [];
  lines.push(`# ${heading}`);
  if (note.created_at) lines.push(`Date: ${formatDate(note.created_at)}`);
  if (tags.length) lines.push(`Tags: ${tags.join(", ")}`);
  if (note.summary) lines.push("", note.summary);
  const body = note.input_text || note.dictated_text || "";
  if (body) lines.push("", body);
  return lines.join("\n").trim();
}

export function formatNotesExport(notes, separator = EXPORT_SEPARATORS.blank) {
  return notes.map(formatNoteForExport).join(separator);
}
