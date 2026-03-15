import type { SkillReference } from "./types";

const SKILL_TOKEN = /\$([a-z][a-z0-9_-]*)\b/g;

export function extractInlineSkillReferences(text: string): SkillReference[] {
  const refs: SkillReference[] = [];
  const segments = splitByCodeFence(text);

  for (const segment of segments) {
    if (segment.fenced) continue;
    let match: RegExpExecArray | null;
    SKILL_TOKEN.lastIndex = 0;
    while ((match = SKILL_TOKEN.exec(segment.text)) !== null) {
      refs.push({
        token: match[0],
        name: match[1],
        start: segment.offset + match.index,
        end: segment.offset + match.index + match[0].length,
      });
    }
  }

  return refs;
}

export function stripInlineSkillTokens(text: string, refs: SkillReference[]): string {
  if (refs.length === 0) return text;
  let result = "";
  let cursor = 0;

  for (const ref of refs) {
    result += text.slice(cursor, ref.start);
    cursor = ref.end;
  }
  result += text.slice(cursor);

  return cleanupWhitespace(result);
}

function splitByCodeFence(text: string): Array<{ text: string; offset: number; fenced: boolean }> {
  const parts: Array<{ text: string; offset: number; fenced: boolean }> = [];
  const regex = /```[\s\S]*?```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), offset: lastIndex, fenced: false });
    }
    parts.push({ text: match[0], offset: match.index, fenced: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), offset: lastIndex, fenced: false });
  }

  return parts;
}

function cleanupWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
