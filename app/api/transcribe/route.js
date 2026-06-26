export const runtime = "nodejs";

const OPENROUTER_TRANSCRIBE_MODEL = String(
  process.env.OPENROUTER_TRANSCRIBE_MODEL || "",
).trim();
const OPENROUTER_TRANSCRIBE_MODELS = String(
  process.env.OPENROUTER_TRANSCRIBE_MODELS || "",
).trim();
const OPENROUTER_TRANSCRIBE_TRANSPORTS = String(
  process.env.OPENROUTER_TRANSCRIBE_TRANSPORTS || "json,multipart",
).trim();
const OPENROUTER_TRANSCRIBE_RETRY_5XX = parseNonNegativeInt(
  process.env.OPENROUTER_TRANSCRIBE_RETRY_5XX,
  1,
);
const OPENROUTER_TRANSCRIBE_RETRY_DELAY_MS = parseNonNegativeInt(
  process.env.OPENROUTER_TRANSCRIBE_RETRY_DELAY_MS,
  300,
);
const OPENROUTER_TRANSCRIBE_MAX_BYTES = parseNonNegativeInt(
  process.env.OPENROUTER_TRANSCRIBE_MAX_BYTES,
  25 * 1024 * 1024,
);
const OPENROUTER_API_BASE = String(
  process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1",
).trim();
const OPENROUTER_APP_TITLE = String(
  process.env.OPENROUTER_APP_TITLE || "Voice to Post",
).trim();
const OPENROUTER_HTTP_REFERER = String(
  process.env.OPENROUTER_HTTP_REFERER || "",
).trim();

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseModelList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTransportList(value) {
  const allowed = new Set(["json", "multipart"]);
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => allowed.has(item));
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferAudioFormat(fileName, mimeType) {
  const normalizedMime = String(mimeType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  const byMime = {
    "audio/webm": "webm",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/aac": "aac",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  if (normalizedMime && byMime[normalizedMime]) return byMime[normalizedMime];

  const ext = String(fileName || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  if (ext) return ext;
  return "webm";
}

function normalizeLanguage(value) {
  const next = String(value || "").trim().toLowerCase();
  if (!next || next === "auto") return "";
  if (/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(next)) return next;
  return "";
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Missing OPENROUTER_API_KEY on server" },
      { status: 500 },
    );
  }

  try {
    const debugParam = new URL(request.url).searchParams.get("debug");
    const isDebug = ["1", "true", "yes", "on"].includes(
      String(debugParam || "").toLowerCase(),
    );
    const incoming = await request.formData();
    const inputFile = incoming.get("file");

    if (!(inputFile instanceof Blob)) {
      return Response.json({ error: "Missing audio file" }, { status: 400 });
    }

    const requestedModel = String(incoming.get("model") || "").trim();
    const language = normalizeLanguage(incoming.get("language"));
    const configuredModels = parseModelList(OPENROUTER_TRANSCRIBE_MODELS);
    if (!configuredModels.length && OPENROUTER_TRANSCRIBE_MODEL) {
      configuredModels.push(OPENROUTER_TRANSCRIBE_MODEL);
    }

    const modelsToTry = unique(
      requestedModel ? [requestedModel, ...configuredModels] : configuredModels,
    );
    const transportsToTry = unique(parseTransportList(OPENROUTER_TRANSCRIBE_TRANSPORTS));
    if (!modelsToTry.length) {
      return Response.json(
        {
          error:
            "Missing transcription model config. Set OPENROUTER_TRANSCRIBE_MODEL or OPENROUTER_TRANSCRIBE_MODELS.",
        },
        { status: 500 },
      );
    }
    if (!transportsToTry.length) {
      return Response.json(
        {
          error:
            "Missing transport config. Set OPENROUTER_TRANSCRIBE_TRANSPORTS to json and/or multipart.",
        },
        { status: 500 },
      );
    }

    const fileName =
      typeof inputFile.name === "string" && inputFile.name.length > 0
        ? inputFile.name
        : "audio.webm";
    const mimeType = typeof inputFile.type === "string" ? inputFile.type : "";
    const format = inferAudioFormat(fileName, mimeType);
    const bytes = Buffer.from(await inputFile.arrayBuffer());
    const byteLength = bytes.byteLength;
    if (byteLength > OPENROUTER_TRANSCRIBE_MAX_BYTES) {
      return Response.json(
        {
          error: `Audio file is too large (${byteLength} bytes). Limit: ${OPENROUTER_TRANSCRIBE_MAX_BYTES} bytes`,
        },
        { status: 413 },
      );
    }
    const base64Data = bytes.toString("base64");
    const callUpstream = async (modelName, transport) => {
      let body;
      let contentType = "";
      if (transport === "json") {
        contentType = "application/json";
        body = JSON.stringify({
          model: modelName,
          input_audio: {
            data: base64Data,
            format,
          },
          ...(language ? { language } : {}),
        });
      } else {
        const upstreamForm = new FormData();
        upstreamForm.append("model", modelName);
        upstreamForm.append("file", inputFile, fileName);
        if (language) upstreamForm.append("language", language);
        body = upstreamForm;
      }

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "X-Title": OPENROUTER_APP_TITLE,
      };
      if (contentType) {
        headers["Content-Type"] = contentType;
      }
      if (OPENROUTER_HTTP_REFERER) {
        headers["HTTP-Referer"] = OPENROUTER_HTTP_REFERER;
      }

      const upstream = await fetch(`${OPENROUTER_API_BASE}/audio/transcriptions`, {
        method: "POST",
        headers,
        body,
      });

      const raw = await upstream.text();
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = { message: raw.slice(0, 500) };
        }
      }

      return { upstream, data, raw, transport };
    };

    let lastFailure = null;
    const attempts = [];
    for (const modelName of modelsToTry) {
      for (const transport of transportsToTry) {
        for (let attempt = 0; attempt <= OPENROUTER_TRANSCRIBE_RETRY_5XX; attempt += 1) {
          const { upstream, data, raw } = await callUpstream(modelName, transport);
          if (upstream.ok) {
            const payload = { text: data.text || "" };
            if (isDebug) {
              payload.debug = {
                model: modelName,
                transport,
                format,
                byteLength,
                language,
                attempts,
              };
            }
            return Response.json(payload);
          }

          const status = upstream.status;
          const message =
            data.error?.message || data.message || `OpenRouter HTTP ${upstream.status}`;
          attempts.push({
            model: modelName,
            transport,
            attempt: attempt + 1,
            status,
            message,
            generationId: upstream.headers.get("x-generation-id") || "",
            raw: String(raw || "").slice(0, 4000),
          });
          lastFailure = { modelName, transport, status, message };

          const shouldRetrySameModel =
            status >= 500 && attempt < OPENROUTER_TRANSCRIBE_RETRY_5XX;
          if (shouldRetrySameModel) {
            await sleep(OPENROUTER_TRANSCRIBE_RETRY_DELAY_MS * (attempt + 1));
            continue;
          }
          break;
        }
      }
    }

    const errorPayload = {
      error: `${lastFailure?.message || "Transcription failed"} (models tried: ${modelsToTry.join(", ")})`,
    };
    if (isDebug) {
      errorPayload.debug = {
        modelsToTry,
        transportsToTry,
        format,
        byteLength,
        language,
        apiBase: OPENROUTER_API_BASE,
        retry5xx: OPENROUTER_TRANSCRIBE_RETRY_5XX,
        retryDelayMs: OPENROUTER_TRANSCRIBE_RETRY_DELAY_MS,
        attempts,
      };
    }
    return Response.json(errorPayload, { status: lastFailure?.status || 502 });
  } catch (error) {
    console.error("Transcribe route failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown transcription error" },
      { status: 500 },
    );
  }
}
