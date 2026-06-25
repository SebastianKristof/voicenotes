import test from "node:test";
import assert from "node:assert/strict";

import { getPublicErrorMessage, getStatusForError } from "../lib/api-errors.js";

test("Supabase fetch failures are reported as service unavailable", () => {
  const error = new Error("Failed to load app voicenotes: TypeError: fetch failed");

  assert.equal(getStatusForError(error), 503);
  assert.match(getPublicErrorMessage(error, "fallback"), /Storage is temporarily unreachable/);
});

test("ordinary errors keep fallback status behavior", () => {
  const error = new Error("inputText is required");

  assert.equal(getStatusForError(error), 500);
  assert.equal(getPublicErrorMessage(error, "fallback"), "inputText is required");
});
