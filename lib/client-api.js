export async function apiJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export async function listNotes() {
  const data = await apiJson('/api/notes');
  return data.notes || [];
}

export async function getNote(id) {
  const data = await apiJson(`/api/notes/${id}`);
  return data.note;
}

export async function createNote(payload) {
  const data = await apiJson('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.note;
}

export async function patchNote(id, payload) {
  const data = await apiJson(`/api/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.note;
}

export async function listSimilar(noteId, limit = 5) {
  const data = await apiJson(`/api/notes/${noteId}/similar?limit=${limit}`);
  return data.similar || [];
}

export async function createNotePost(noteId, payload) {
  const data = await apiJson(`/api/notes/${noteId}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.post;
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
