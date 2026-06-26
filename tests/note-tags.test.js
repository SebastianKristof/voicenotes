import test from "node:test";
import assert from "node:assert/strict";

import { mergeTagSlugs, normalizeTagInput, suggestTagSlugs } from "../lib/note-tags.js";

test("normalizeTagInput creates latin slug", () => {
  assert.deepEqual(normalizeTagInput("Work Projects"), {
    slug: "work-projects",
    name: "Work Projects",
  });
});

test("suggestTagSlugs finds matching defaults", () => {
  assert.deepEqual(suggestTagSlugs({ input_text: "Новый клиент и бизнес запуск" }), ["business"]);
});

test("mergeTagSlugs deduplicates normalized tags", () => {
  assert.deepEqual(mergeTagSlugs(["Work Projects"], ["work-projects"]), ["work-projects"]);
});
