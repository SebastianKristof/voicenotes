export const runtime = "nodejs";

const OPENROUTER_TRANSCRIBE_MODEL =
  process.env.OPENROUTER_TRANSCRIBE_MODEL || "openai/whisper-large-v3";

function inferAudioFormat(fileName, mimeType) {
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
  };
  if (mimeType && byMime[mimeType]) return byMime[mimeType];

  const ext = String(fileName || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  if (ext) return ext;
  return "webm";
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
    const incoming = await request.formData();
    const inputFile = incoming.get("file");

    if (!(inputFile instanceof Blob)) {
      return Response.json({ error: "Missing audio file" }, { status: 400 });
    }

    const model = String(incoming.get("model") || OPENROUTER_TRANSCRIBE_MODEL);
    const fileName =
      typeof inputFile.name === "string" && inputFile.name.length > 0
        ? inputFile.name
        : "audio.webm";
    const mimeType = typeof inputFile.type === "string" ? inputFile.type : "";
    const format = inferAudioFormat(fileName, mimeType);
    const bytes = Buffer.from(await inputFile.arrayBuffer());
    const base64Data = bytes.toString("base64");

    const upstream = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Title": "Voice to Post",
      },
      body: JSON.stringify({
        model,
        input_audio: {
          data: base64Data,
          format,
        },
      }),
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

    if (!upstream.ok) {
      return Response.json(
        {
          error:
            data.error?.message ||
            data.message ||
            `OpenRouter HTTP ${upstream.status}`,
        },
        { status: upstream.status },
      );
    }

    return Response.json({ text: data.text || "" });
  } catch (error) {
    console.error("Transcribe route failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown transcription error" },
      { status: 500 },
    );
  }
}
