import test from "node:test";
import assert from "node:assert/strict";

import { isNotesCacheFresh, mergeNotePages, readNotesCache, writeNotesCache } from "../lib/note-cache.js";

test("mergeNotePages deduplicates and sorts by newest", () => {
  const merged = mergeNotePages(
    [{ id: "1", created_at: "2026-01-01T00:00:00.000Z", heading: "old" }],
    [
      { id: "1", created_at: "2026-01-01T00:00:00.000Z", heading: "updated" },
      { id: "2", created_at: "2026-01-02T00:00:00.000Z", heading: "new" },
    ],
  );

  assert.deepEqual(merged.map((note) => note.id), ["2", "1"]);
  assert.equal(merged[1].heading, "updated");
});

test("notes cache reads and writes localStorage payload", () => {
  const store = new Map();
  global.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
  };

  try {
    writeNotesCache([{ id: "1" }], "next");
    const cache = readNotesCache();
    assert.deepEqual(cache.notes, [{ id: "1" }]);
    assert.equal(cache.nextCursor, "next");
    assert.equal(isNotesCacheFresh(cache), true);
  } finally {
    delete global.localStorage;
  }
});
