import { getAppId } from "./mvp-hub-repo";
import { getSupabaseAdmin } from "./supabase-admin";

function inHub(supabase) {
  return supabase.schema("mvp_hub");
}

function mustData(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}

function tokenBytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeOptional(value) {
  const next = String(value || "").trim();
  return next || null;
}

export async function generateSessionToken() {
  if (!globalThis.crypto?.getRandomValues) {
    const { randomBytes } = await import("node:crypto");
    return randomBytes(32).toString("hex");
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return tokenBytesToHex(bytes);
}

export async function hashSessionToken(token) {
  const raw = String(token || "");
  if (globalThis.crypto?.subtle?.digest) {
    const input = new TextEncoder().encode(raw);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", input);
    return tokenBytesToHex(new Uint8Array(hashBuffer));
  }

  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(raw).digest("hex");
}

function mapSession(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    created_ip: row.created_ip,
    last_seen_ip: row.last_seen_ip,
    user_agent: row.user_agent,
    last_seen_user_agent: row.last_seen_user_agent,
    terminated_at: row.terminated_at,
  };
}

export async function createAccessSession({ ip, userAgent }) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();
  const token = await generateSessionToken();
  const tokenHash = await hashSessionToken(token);

  const insertResult = await inHub(supabase)
    .from("access_sessions")
    .insert({
      app_id: appId,
      token_hash: tokenHash,
      created_ip: normalizeOptional(ip),
      last_seen_ip: normalizeOptional(ip),
      user_agent: normalizeOptional(userAgent),
      last_seen_user_agent: normalizeOptional(userAgent),
    })
    .select(
      "id, created_at, last_seen_at, created_ip, last_seen_ip, user_agent, last_seen_user_agent, terminated_at",
    )
    .single();

  return {
    token,
    session: mapSession(mustData(insertResult, "Failed to create access session")),
  };
}

export async function findAccessSessionByToken(token) {
  const rawToken = String(token || "").trim();
  if (!rawToken) return null;

  const supabase = getSupabaseAdmin();
  const appId = await getAppId();
  const tokenHash = await hashSessionToken(rawToken);

  const query = await inHub(supabase)
    .from("access_sessions")
    .select(
      "id, created_at, last_seen_at, created_ip, last_seen_ip, user_agent, last_seen_user_agent, terminated_at",
    )
    .eq("app_id", appId)
    .eq("token_hash", tokenHash)
    .is("terminated_at", null)
    .maybeSingle();

  if (query.error) {
    throw new Error(`Failed to validate access session: ${query.error.message}`);
  }

  if (!query.data) return null;
  return mapSession(query.data);
}

export async function touchAccessSession(sessionId, { ip, userAgent }) {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const updatePayload = {
    last_seen_at: nowIso(),
  };
  const normalizedIp = normalizeOptional(ip);
  const normalizedUserAgent = normalizeOptional(userAgent);
  if (normalizedIp) updatePayload.last_seen_ip = normalizedIp;
  if (normalizedUserAgent) updatePayload.last_seen_user_agent = normalizedUserAgent;

  const updateResult = await inHub(supabase)
    .from("access_sessions")
    .update(updatePayload)
    .eq("app_id", appId)
    .eq("id", sessionId)
    .is("terminated_at", null)
    .select(
      "id, created_at, last_seen_at, created_ip, last_seen_ip, user_agent, last_seen_user_agent, terminated_at",
    )
    .maybeSingle();

  if (updateResult.error) {
    throw new Error(`Failed to refresh access session: ${updateResult.error.message}`);
  }

  if (!updateResult.data) return null;
  return mapSession(updateResult.data);
}

export async function validateAndTouchAccessSession(token, context = {}) {
  const existing = await findAccessSessionByToken(token);
  if (!existing) return null;
  const touched = await touchAccessSession(existing.id, context).catch(() => null);
  return touched || existing;
}

export async function listOpenAccessSessions() {
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const result = await inHub(supabase)
    .from("access_sessions")
    .select(
      "id, created_at, last_seen_at, created_ip, last_seen_ip, user_agent, last_seen_user_agent, terminated_at",
    )
    .eq("app_id", appId)
    .is("terminated_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(200);

  return mustData(result, "Failed to list access sessions").map(mapSession);
}

export async function terminateAccessSessionById(id) {
  const sessionId = String(id || "").trim();
  if (!sessionId) {
    throw new Error("Session id is required");
  }

  const supabase = getSupabaseAdmin();
  const appId = await getAppId();

  const result = await inHub(supabase)
    .from("access_sessions")
    .update({ terminated_at: nowIso() })
    .eq("app_id", appId)
    .eq("id", sessionId)
    .is("terminated_at", null)
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw new Error(`Failed to terminate access session: ${result.error.message}`);
  }
}

export async function terminateAccessSessionByToken(token) {
  const rawToken = String(token || "").trim();
  if (!rawToken) return;
  const supabase = getSupabaseAdmin();
  const appId = await getAppId();
  const tokenHash = await hashSessionToken(rawToken);

  const result = await inHub(supabase)
    .from("access_sessions")
    .update({ terminated_at: nowIso() })
    .eq("app_id", appId)
    .eq("token_hash", tokenHash)
    .is("terminated_at", null);

  if (result.error) {
    throw new Error(`Failed to terminate current access session: ${result.error.message}`);
  }
}
