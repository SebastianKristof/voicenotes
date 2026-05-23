import { loadPromptTemplate, renderPrompt } from "../../../lib/prompt-template";

export const runtime = "nodejs";

const OPENROUTER_TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || "openai/gpt-4o-mini";

function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
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
    const { text } = await request.json();
    const trimmedText = typeof text === "string" ? text.trim() : "";

    if (!trimmedText) {
      return Response.json({ error: "Text is required" }, { status: 400 });
    }

    const template = await loadPromptTemplate("summary.md");
    if (!template) {
      return Response.json(
        { error: "Prompt template not found: prompts/summary.md" },
        { status: 500 },
      );
    }
    const prompt = renderPrompt(template, { TEXT: trimmedText });

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Title": "Voice to Post",
      },
      body: JSON.stringify({
        model: OPENROUTER_TEXT_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        response_format: {
          type: "json_object",
        },
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return Response.json(
        { error: data.error?.message || `OpenRouter HTTP ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const rawContent = extractTextContent(data.choices?.[0]?.message?.content).trim();
    let parsed = {};

    try {
      parsed = rawContent ? JSON.parse(rawContent) : {};
    } catch {
      parsed = {};
    }

    const heading = typeof parsed.heading === "string" ? parsed.heading.trim() : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

    return Response.json({ heading, summary });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown summary error" },
      { status: 500 },
    );
  }
}
