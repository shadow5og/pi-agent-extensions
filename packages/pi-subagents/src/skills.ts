import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

export interface ResolvedSkill {
  name: string;
  path: string;
  source: "global" | "user-agents" | "project" | "project-agents";
}

export async function discoverResolvedSkills(cwd: string): Promise<ResolvedSkill[]> {
  const roots = [
    { dir: join(homedir(), ".pi", "agent", "skills"), source: "global" as const },
    { dir: join(homedir(), ".agents", "skills"), source: "user-agents" as const },
    ...walkProjectSkillRoots(cwd),
  ];

  const merged = new Map<string, ResolvedSkill>();
  for (const root of roots) {
    const skills = await loadSkillRefs(root.dir, root.source);
    for (const skill of skills) merged.set(skill.name, skill);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveSkillPaths(names: string[] | undefined, cwd: string): Promise<string[]> {
  if (!names?.length) return [];
  const skillMap = new Map((await discoverResolvedSkills(cwd)).map((skill) => [skill.name, skill]));
  const resolved: string[] = [];
  for (const name of names) {
    const found = skillMap.get(name);
    if (found) resolved.push(found.path);
  }
  return resolved;
}

export async function buildInjectedSkillPrompt(names: string[] | undefined, cwd: string): Promise<string> {
  const paths = await resolveSkillPaths(names, cwd);
  if (!paths.length) return "";
  const parts: string[] = [];
  for (const path of paths) {
    try {
      const markdown = await readFile(join(path, 'SKILL.md'), 'utf8');
      const body = stripFrontmatter(markdown).trim();
      const name = path.split('/').pop() || 'unknown-skill';
      parts.push(`<injected-skill name="${name}">\n${body}\n</injected-skill>`);
    } catch {
      // ignore unreadable skills
    }
  }
  if (!parts.length) return "";
  return [
    "The following skills are explicitly injected for this subagent run.",
    "Follow them as part of the system instructions for this task.",
    parts.join("\n\n"),
  ].join("\n\n");
}

async function loadSkillRefs(root: string, source: ResolvedSkill["source"]): Promise<ResolvedSkill[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  return entries.map((entry) => ({
    name: entry,
    path: join(root, entry),
    source,
  }));
}

function walkProjectSkillRoots(cwd: string): Array<{ dir: string; source: ResolvedSkill["source"] }> {
  const roots: Array<{ dir: string; source: ResolvedSkill["source"] }> = [];
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
