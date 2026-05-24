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

export async function transcribeFile(file) {
  const formData = new FormData();
  formData.append('file', file, file.name || 'audio.webm');
  formData.append('model', 'openai/whisper-large-v3');
  const data = await apiJson('/api/transcribe', {
    method: 'POST',
    body: formData,
  });
  return (data.text || '').trim();
}
