import test from "node:test";
import assert from "node:assert/strict";

import { apiJson, listNotes, transcribeFile } from "../lib/client-api.js";

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
    const result = await listNotes();
    assert.deepEqual(result, { notes: [{ id: "n1" }], nextCursor: "" });
  } finally {
    global.fetch = originalFetch;
  }
});

test("listNotes sends pagination and filter params", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.equal(url, "/api/notes?limit=20&cursor=abc&tag=work&q=launch");
    return new Response(JSON.stringify({ notes: [], nextCursor: "next" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await listNotes({ limit: 20, cursor: "abc", tag: "work", q: "launch" });
    assert.deepEqual(result, { notes: [], nextCursor: "next" });
  } finally {
    global.fetch = originalFetch;
  }
});

test("transcribeFile sends forced language when provided", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("language"), "ru");
    return new Response(JSON.stringify({ text: "готово" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const text = await transcribeFile(new File([new Blob(["audio"])], "clip.webm"), { language: "ru" });
    assert.equal(text, "готово");
  } finally {
    global.fetch = originalFetch;
  }
});
