export async function apiJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      const nextParam = encodeURIComponent(currentPath || "/");
      window.location.assign(`/access?next=${nextParam}`);
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeId(value) {
  if (typeof value !== 'string') return '';
  const next = value.trim();
  if (!next || next === 'undefined' || next === 'null') return '';
  return next;
}

function ensureUuid(value, context) {
  const id = normalizeId(value);
  if (!UUID_RE.test(id)) {
    throw new Error(`${context}: invalid note id`);
  }
  return id;
}

export async function listNotes() {
  const data = await apiJson('/api/notes');
  return data.notes || [];
}

export async function getNote(id) {
  const safeId = ensureUuid(id, 'Failed to load note');
  const data = await apiJson(`/api/notes/${safeId}`);
  return data.note;
}

export async function createNote(payload) {
  const data = await apiJson('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const note = data.note || null;
  ensureUuid(note?.id, 'Failed to create note');
  return note;
}

export async function patchNote(id, payload) {
  const safeId = ensureUuid(id, 'Failed to update note');
  const data = await apiJson(`/api/notes/${safeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.note;
}

export async function removeNote(id) {
  const safeId = ensureUuid(id, 'Failed to delete note');
  await apiJson(`/api/notes/${safeId}`, { method: 'DELETE' });
}

export async function listSimilar(noteId, limit = 5) {
  const safeId = ensureUuid(noteId, 'Failed to load similar notes');
  const data = await apiJson(`/api/notes/${safeId}/similar?limit=${limit}`);
  return data.similar || [];
}

export async function createNotePost(noteId, payload) {
  const safeId = ensureUuid(noteId, 'Failed to save note post');
  const data = await apiJson(`/api/notes/${safeId}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.post;
}

export async function patchNotePost(noteId, postId, payload) {
  const safeNoteId = ensureUuid(noteId, 'Failed to update note post');
  const safePostId = ensureUuid(postId, 'Failed to update note post');
  const data = await apiJson(`/api/notes/${safeNoteId}/posts/${safePostId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.post;
}

export async function removeNotePost(noteId, postId) {
  const safeNoteId = ensureUuid(noteId, 'Failed to delete note post');
  const safePostId = ensureUuid(postId, 'Failed to delete note post');
  await apiJson(`/api/notes/${safeNoteId}/posts/${safePostId}`, { method: 'DELETE' });
}

export async function listStyles() {
  const data = await apiJson('/api/styles');
  return data.styles || [];
}

export async function saveStyle(payload) {
  const data = await apiJson('/api/styles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.style;
}

export async function removeStyle(id) {
  await apiJson(`/api/styles/${id}`, { method: 'DELETE' });
}

export async function listOpenSessions() {
  const data = await apiJson('/api/access/sessions');
  return data.sessions || [];
}

export async function terminateOpenSession(id) {
  await apiJson(`/api/access/sessions/${id}`, { method: 'DELETE' });
}

export async function logoutAccessSession() {
  await apiJson('/api/access', { method: 'DELETE' });
}

export async function summarize(text) {
  const data = await apiJson('/api/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return { heading: (data.heading || '').trim(), summary: (data.summary || '').trim() };
}

export async function generatePost(payload) {
  const data = await apiJson('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (data.post || '').trim();
}

function isDebugEnabled() {
  if (typeof window === 'undefined') return false;
  const raw = (new URLSearchParams(window.location.search).get('debug') || '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function buildTranscribeError(data, status) {
  const base = data.error || `HTTP ${status}`;
  if (!isDebugEnabled() || !data.debug) return base;
  let details = '';
  try {
    details = JSON.stringify(data.debug, null, 2);
  } catch {
    details = String(data.debug);
  }
  return `${base}\n\nDEBUG:\n${details}`;
}

export async function transcribeFile(file) {
  const formData = new FormData();
  formData.append('file', file, file.name || 'audio.webm');
  const debugEnabled = isDebugEnabled();
  const endpoint = debugEnabled ? '/api/transcribe?debug=1' : '/api/transcribe';
  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(buildTranscribeError(data, response.status));
  }
  return (data.text || '').trim();
}
