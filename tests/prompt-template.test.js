import test from "node:test";
import assert from "node:assert/strict";

import { renderPrompt } from "../lib/prompt-template.js";

test("renderPrompt replaces variables by token", () => {
  const template = "Hello {{NAME}}, length={{LEN}}";
  const result = renderPrompt(template, { NAME: "Alex", LEN: "short" });
  assert.equal(result, "Hello Alex, length=short");
});

test("renderPrompt keeps unmatched tokens intact", () => {
  const template = "Hello {{NAME}}, {{MISSING}}";
  const result = renderPrompt(template, { NAME: "Alex" });
  assert.equal(result, "Hello Alex, {{MISSING}}");
});
