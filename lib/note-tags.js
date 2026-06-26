export const DEFAULT_TAGS = [
  { slug: "work-projects", name: "work projects", keywords: ["проект", "работ", "спринт", "релиз", "таск", "client", "project"] },
  { slug: "meetings", name: "meetings", keywords: ["созвон", "встреч", "митинг", "call", "meeting"] },
  { slug: "home", name: "home", keywords: ["дом", "квартир", "ремонт", "уборк", "home"] },
  { slug: "family-kids", name: "family/kids", keywords: ["дет", "сын", "дочь", "семь", "школ", "садик", "kids"] },
  { slug: "business", name: "business", keywords: ["бизнес", "продаж", "клиент", "рынок", "выручк", "business"] },
  { slug: "ideas", name: "ideas", keywords: ["иде", "гипотез", "придум", "feature", "idea"] },
  { slug: "finance", name: "finance", keywords: ["деньг", "бюджет", "счет", "налог", "финанс", "finance"] },
  { slug: "health", name: "health", keywords: ["здоров", "врач", "сон", "трениров", "health"] },
  { slug: "learning", name: "learning", keywords: ["уч", "курс", "книг", "исслед", "learning"] },
  { slug: "errands", name: "errands", keywords: ["купить", "заказ", "достав", "дела", "errand"] },
  { slug: "travel", name: "travel", keywords: ["поезд", "билет", "отель", "путеше", "travel"] },
];

export function normalizeTagSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s-]/gi, "")
    .replace(/[а-яё]+/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeTagName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeTagInput(value) {
  const name = normalizeTagName(value);
  const slug = normalizeTagSlug(name);
  return slug && name ? { slug, name } : null;
}

export function suggestTagSlugs(note, tags = DEFAULT_TAGS) {
  const text = `${note?.heading || ""} ${note?.summary || ""} ${note?.input_text || ""} ${note?.inputText || ""}`.toLowerCase();
  if (!text.trim()) return [];
  return tags
    .filter((tag) => tag.keywords.some((keyword) => text.includes(keyword.toLowerCase())))
    .map((tag) => tag.slug);
}

export function mergeTagSlugs(...groups) {
  return Array.from(new Set(groups.flat().map(normalizeTagSlug).filter(Boolean)));
}
