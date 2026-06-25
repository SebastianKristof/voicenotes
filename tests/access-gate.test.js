import test from "node:test";
import assert from "node:assert/strict";

import { createLocalAccessToken, validateLocalAccessToken } from "../lib/access-gate.js";

test("local access token validates with current access code", async () => {
  const originalAccessCode = process.env.ACCESS_CODE;
  process.env.ACCESS_CODE = "test-access-code";

  try {
    const token = await createLocalAccessToken();
    const session = await validateLocalAccessToken(token);

    assert.equal(session.id, "local");
    assert.equal(session.terminated_at, null);
  } finally {
    if (originalAccessCode === undefined) {
      delete process.env.ACCESS_CODE;
    } else {
      process.env.ACCESS_CODE = originalAccessCode;
    }
  }
});

test("local access token rejects after access code changes", async () => {
  const originalAccessCode = process.env.ACCESS_CODE;
  process.env.ACCESS_CODE = "first-code";

  try {
    const token = await createLocalAccessToken();
    process.env.ACCESS_CODE = "second-code";

    const session = await validateLocalAccessToken(token);
    assert.equal(session, null);
  } finally {
    if (originalAccessCode === undefined) {
      delete process.env.ACCESS_CODE;
    } else {
      process.env.ACCESS_CODE = originalAccessCode;
    }
  }
});
