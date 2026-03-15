import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

import type { DiscoveredSkill } from "./types";

export async function discoverSkills(cwd: string): Promise<DiscoveredSkill[]> {
  const roots = [
    { dir: join(homedir(), ".pi", "agent", "skills"), source: "global" as const },
    { dir: join(homedir(), ".agents", "skills"), source: "user-agents" as const },
    ...walkProjectSkillRoots(cwd),
  ];

  const merged = new Map<string, DiscoveredSkill>();
  for (const root of roots) {
    const skills = await loadSkillsFromRoot(root.dir, root.source);
    for (const skill of skills) {
      merged.set(skill.name, skill);
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverSkillMap(cwd: string): Promise<Map<string, DiscoveredSkill>> {
  const skills = await discoverSkills(cwd);
  return new Map(skills.map((skill) => [skill.name, skill]));
}

async function loadSkillsFromRoot(
  root: string,
  source: DiscoveredSkill["source"],
): Promise<DiscoveredSkill[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const results: DiscoveredSkill[] = [];
  for (const entry of entries) {
    const path = join(root, entry, "SKILL.md");
    try {
      const raw = await readFile(path, "utf8");
      results.push(parseSkill(raw, path, source));
    } catch {
      // ignore invalid/missing entries
    }
  }

  return results;
}

function parseSkill(raw: string, path: string, source: DiscoveredSkill["source"]): DiscoveredSkill {
  const { frontmatter, body } = splitFrontmatter(raw);
  return {
    name: String(frontmatter.name || dirname(path).split("/").pop() || "unknown"),
    path,
    source,
    description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
    content: body.trim(),
  };
}

function splitFrontmatter(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return { frontmatter: {}, body: text };
  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---" || lines[i]?.trim() === "...") {
      end = i;
      break;
    }
  }
  if (end === -1) return { frontmatter: {}, body: text };

  const frontmatter: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = stripQuotes(value);
  }

  return { frontmatter, body: lines.slice(end + 1).join("\n") };
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function walkProjectSkillRoots(cwd: string): Array<{ dir: string; source: DiscoveredSkill["source"] }> {
  const roots: Array<{ dir: string; source: DiscoveredSkill["source"] }> = [];
  let current = resolve(cwd);

  while (true) {
    roots.push({ dir: join(current, ".pi", "skills"), source: "project" });
    roots.push({ dir: join(current, ".agents", "skills"), source: "project-agents" });
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return roots;
}
