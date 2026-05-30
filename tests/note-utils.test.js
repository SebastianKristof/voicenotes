import test from "node:test";
import assert from "node:assert/strict";

import { appendTranscribedText, deriveLatestPostDraft } from "../lib/note-utils.js";

test("appendTranscribedText appends with blank line separator", () => {
  const result = appendTranscribedText("first part", "second part");
  assert.equal(result, "first part\n\nsecond part");
});

test("appendTranscribedText ignores empty incoming text", () => {
  const result = appendTranscribedText("first part", "   ");
  assert.equal(result, "first part");
});

test("deriveLatestPostDraft returns defaults without post history", () => {
  const draft = deriveLatestPostDraft({ posts: [] }, []);
  assert.deepEqual(draft, {
    length: "medium",
    extraInstructions: "",
    styleName: "",
    styleInstructions: "",
    selectedStyleId: "",
  });
});

test("deriveLatestPostDraft links latest post style name to selected style id", () => {
  const note = {
    posts: [
      {
        length: "long",
        extra_instructions: "be concise",
        style_name: "Founder voice",
        style_instructions: "Write in short paragraphs",
      },
    ],
  };
  const styles = [{ id: "style-1", name: "Founder voice", instructions: "..." }];
  const draft = deriveLatestPostDraft(note, styles);

  assert.deepEqual(draft, {
    length: "long",
    extraInstructions: "be concise",
    styleName: "Founder voice",
    styleInstructions: "Write in short paragraphs",
    selectedStyleId: "style-1",
  });
});
