import test from "node:test";
import assert from "node:assert/strict";

import { apiJson, listNotes } from "../lib/client-api.js";

test("apiJson returns parsed json on ok response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const data = await apiJson("/api/test");
    assert.deepEqual(data, { ok: true });
  } finally {
    global.fetch = originalFetch;
  }
});

test("apiJson throws message from error payload", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ error: "Boom" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(() => apiJson("/api/test"), /Boom/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("listNotes calls /api/notes and returns notes array", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.equal(url, "/api/notes");
    return new Response(JSON.stringify({ notes: [{ id: "n1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const notes = await listNotes();
    assert.deepEqual(notes, [{ id: "n1" }]);
  } finally {
    global.fetch = originalFetch;
  }
});
