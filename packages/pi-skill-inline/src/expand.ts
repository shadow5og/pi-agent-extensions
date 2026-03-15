import { extractInlineSkillReferences, stripInlineSkillTokens } from "./parser";
import type { DiscoveredSkill, SkillReference } from "./types";

export function expandInlineSkills(
  text: string,
  skillMap: Map<string, DiscoveredSkill>,
): { text: string; used: DiscoveredSkill[]; missing: string[] } {
  const refs = extractInlineSkillReferences(text);
  if (refs.length === 0) {
    return { text, used: [], missing: [] };
  }

  const used: DiscoveredSkill[] = [];
  const seen = new Set<string>();
  const missing: string[] = [];
  const matchedRefs: SkillReference[] = [];

  for (const ref of refs) {
    const skill = skillMap.get(ref.name);
    if (!skill) {
      if (!missing.includes(ref.name)) missing.push(ref.name);
      continue;
    }
    matchedRefs.push(ref);
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    used.push(skill);
  }

  if (used.length === 0) {
    return { text, used, missing };
  }

  const stripped = stripInlineSkillTokens(text, matchedRefs);
  const wrappedSkills = used
    .map((skill) => {
      const description = skill.description ? `\nDescription: ${skill.description}` : "";
      return [
        `<inline-skill name="${skill.name}" source="${skill.source}">`,
        `${description}`.trim(),
        skill.content.trim(),
        `</inline-skill>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const prelude = [
    "The user explicitly requested the following skills to be applied to this prompt.",
    "Follow the skill instructions faithfully and combine them with the user request below.",
    wrappedSkills,
  ].join("\n\n");

  const expanded = `${prelude}\n\nUser request:\n${stripped}`.trim();
  return { text: expanded, used, missing };
}
