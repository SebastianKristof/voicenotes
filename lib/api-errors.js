export function getStatusForError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("fetch failed") || message.includes("ENOTFOUND")) {
    return 503;
  }
  return 500;
}

export function getPublicErrorMessage(error, fallback) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("fetch failed") || message.includes("ENOTFOUND")) {
    return "Storage is temporarily unreachable. Check NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and network/DNS access to Supabase.";
  }
  return message || fallback;
}
