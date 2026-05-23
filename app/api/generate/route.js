import { loadPromptTemplate, renderPrompt } from "../../../lib/prompt-template";

export const runtime = "nodejs";

const OPENROUTER_TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || "openai/gpt-4o-mini";

const LENGTH_MAP = {
  short: "Короткий пост: примерно 2-4 предложения.",
  medium: "Средний пост: примерно 5-8 предложений.",
  long: "Длинный пост: примерно 9-14 предложений или структурированный разбор.",
};

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
    const { text, styleInstructions, extraInstructions, length } = await request.json();
    const trimmedText = typeof text === "string" ? text.trim() : "";
    const trimmedStyle =
      typeof styleInstructions === "string" ? styleInstructions.trim() : "";
    const trimmedExtra =
      typeof extraInstructions === "string" ? extraInstructions.trim() : "";
    const normalizedLength =
      typeof length === "string" && length in LENGTH_MAP ? length : "medium";

    if (!trimmedText) {
      return Response.json({ error: "Text is required" }, { status: 400 });
    }
    if (!trimmedStyle) {
      return Response.json(
        { error: "Style instructions are required" },
        { status: 400 },
      );
    }

    const template = await loadPromptTemplate("generate-post.md");
    if (!template) {
      return Response.json(
        { error: "Prompt template not found: prompts/generate-post.md" },
        { status: 500 },
      );
    }
    const prompt = renderPrompt(template, {
      TEXT: trimmedText,
      STYLE_INSTRUCTIONS: trimmedStyle,
      EXTRA_INSTRUCTIONS: trimmedExtra || "Нет дополнительных инструкций.",
      LENGTH_INSTRUCTION: LENGTH_MAP[normalizedLength],
    });

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Title": "Voice to Post",
      },
      body: JSON.stringify({
        model: OPENROUTER_TEXT_MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return Response.json(
        { error: data.error?.message || `OpenRouter HTTP ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const post = extractTextContent(data.choices?.[0]?.message?.content).trim();
    return Response.json({ post });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown generation error" },
      { status: 500 },
    );
  }
}
