const DEFAULT_LENGTH = "medium";

export function appendTranscribedText(baseText, incomingText) {
  const incoming = String(incomingText || "").trim();
  if (!incoming) return String(baseText || "").trim();
  const base = String(baseText || "").trim();
  return base ? `${base}\n\n${incoming}` : incoming;
}

export function deriveLatestPostDraft(note, styles) {
  const latest = note?.posts?.[0];
  if (!latest) {
    return {
      length: DEFAULT_LENGTH,
      extraInstructions: "",
      styleName: "",
      styleInstructions: "",
      selectedStyleId: "",
    };
  }

  const selectedStyle =
    Array.isArray(styles) && latest.style_name
      ? styles.find((item) => item.name === latest.style_name)
      : null;

  return {
    length: latest.length || DEFAULT_LENGTH,
    extraInstructions: latest.extra_instructions || "",
    styleName: latest.style_name || "",
    styleInstructions: latest.style_instructions || "",
    selectedStyleId: selectedStyle?.id || "",
  };
}
