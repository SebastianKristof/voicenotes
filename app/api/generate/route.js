export const runtime = "nodejs";

const OPENROUTER_TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || "openai/gpt-4o-mini";

const TONES = {
  thoughtful:
    "Вдумчивый, аналитический тон. Пост глубокий, с инсайтами. Подходит для LinkedIn или личного блога.",
  casual:
    "Разговорный, живой тон. Как будто пишешь другу. Короткие предложения, эмодзи уместны.",
  bold:
    "Дерзкий, провокационный тон. Без воды, прямо в точку. Можно использовать сильные утверждения.",
  story:
    "Формат личной истории. Начни с крючка, расскажи ситуацию, дай вывод.",
  thread:
    "Формат треда (X/Twitter). Разбей на нумерованные пункты 1/ 2/ 3/ и т.д. Каждый пункт — отдельная мысль.",
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
    const { text, tone } = await request.json();
    const trimmedText = typeof text === "string" ? text.trim() : "";

    if (!trimmedText) {
      return Response.json({ error: "Text is required" }, { status: 400 });
    }

    const prompt = `Ты — эксперт по написанию постов для социальных сетей.

Голосовая заметка (транскрипция):
"""
${trimmedText}
"""

Тон и формат: ${TONES[tone] || TONES.thoughtful}

Задача: напиши готовый пост на основе этой заметки.
- Сохрани основную мысль автора
- Не придумывай то, чего нет в тексте
- Убери слова-паразиты и повторы
- Пост должен быть готов к публикации

Верни ТОЛЬКО текст поста, без пояснений.`;

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
