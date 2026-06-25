export const ACCESS_COOKIE_NAME = "vn_access_code";
export const ACCESS_NEXT_PARAM = "next";
export const ACCESS_PAGE_PATH = "/access";
export const ACCESS_API_PATH = "/api/access";

const LOCAL_TOKEN_PREFIX = "local.v1";
const SIGNATURE_BYTES = 32;

export function getRequiredAccessCode() {
  return (process.env.ACCESS_CODE || "").trim();
}

export function isValidAccessCode(candidate) {
  const required = getRequiredAccessCode();
  if (!required) return false;
  return String(candidate || "") === required;
}

export function buildAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 20,
  };
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomTokenPart() {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function textToBytes(value) {
  return new TextEncoder().encode(value);
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

async function signLocalTokenPayload(payload) {
  const requiredCode = getRequiredAccessCode();
  if (!requiredCode) return "";

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    textToBytes(requiredCode),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, textToBytes(payload));
  return bytesToBase64Url(new Uint8Array(signature).slice(0, SIGNATURE_BYTES));
}

function parseLocalAccessToken(token) {
  const raw = String(token || "").trim();
  const [prefix, version, issuedAt, nonce, signature] = raw.split(".");
  if (`${prefix}.${version}` !== LOCAL_TOKEN_PREFIX || !issuedAt || !nonce || !signature) {
    return null;
  }
  return {
    issuedAt,
    nonce,
    signature,
    payload: `${LOCAL_TOKEN_PREFIX}.${issuedAt}.${nonce}`,
  };
}

export async function createLocalAccessToken() {
  const issuedAt = String(Date.now());
  const nonce = randomTokenPart();
  const payload = `${LOCAL_TOKEN_PREFIX}.${issuedAt}.${nonce}`;
  const signature = await signLocalTokenPayload(payload);
  return `${payload}.${signature}`;
}

export async function validateLocalAccessToken(token) {
  const parsed = parseLocalAccessToken(token);
  if (!parsed) return null;

  const expected = await signLocalTokenPayload(parsed.payload);
  if (!expected || !constantTimeEqual(expected, parsed.signature)) return null;

  const createdAtMs = Number(parsed.issuedAt);
  const createdAt = Number.isFinite(createdAtMs) ? new Date(createdAtMs) : new Date();
  return {
    id: "local",
    created_at: createdAt.toISOString(),
    last_seen_at: new Date().toISOString(),
    created_ip: null,
    last_seen_ip: null,
    user_agent: null,
    last_seen_user_agent: "local access token",
    terminated_at: null,
  };
}
