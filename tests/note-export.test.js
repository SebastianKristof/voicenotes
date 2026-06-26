import test from "node:test";
import assert from "node:assert/strict";

import { formatNotesExport } from "../lib/note-export.js";

test("formatNotesExport includes heading, tags, summary, and text", () => {
  const output = formatNotesExport([
    {
      heading: "Launch",
      created_at: "2026-01-01T00:00:00.000Z",
      tags: [{ name: "business" }],
      summary: "Short summary",
      input_text: "Full transcript",
    },
  ], "\n---\n");

  assert.match(output, /# Launch/);
  assert.match(output, /Tags: business/);
  assert.match(output, /Short summary/);
  assert.match(output, /Full transcript/);
});
