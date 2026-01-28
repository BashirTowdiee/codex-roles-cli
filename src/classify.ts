import { callCodex } from "./codex.js";
import { parseJson, validateClassification } from "./schema.js";
import { readPrompt } from "./retrieve.js";

export async function classifyTask(task: string) {
  const prompt = await readPrompt("classify.txt");
  const raw = await callCodex(prompt, { task });
  const parsed = parseJson(raw, "Classifier output");
  return validateClassification(parsed);
}
