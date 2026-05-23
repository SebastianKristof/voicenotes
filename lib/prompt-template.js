import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadPromptTemplate(fileName) {
  const filePath = path.join(process.cwd(), "prompts", fileName);
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export function renderPrompt(template, variables) {
  let output = template;
  for (const [key, value] of Object.entries(variables)) {
    const token = `{{${key}}}`;
    output = output.split(token).join(String(value ?? ""));
  }
  return output;
}
