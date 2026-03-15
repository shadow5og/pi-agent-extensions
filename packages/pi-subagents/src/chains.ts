import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { ChainTaskItem } from "./schema";

export interface SubagentChainDefinition {
  name: string;
  description?: string;
  steps: ChainTaskItem[];
  path?: string;
  source: "user" | "project";
}

export async function discoverChains(cwd: string): Promise<SubagentChainDefinition[]> {
  const merged = new Map<string, SubagentChainDefinition>();
  const dirs = [join(homedir(), ".pi", "agent", "agents"), ...getProjectAgentDirs(cwd)];
  for (const dir of dirs) {
    const source = dir.startsWith(join(homedir(), ".pi", "agent")) ? "user" : "project";
    for (const chain of await loadChainsFromDirectory(dir, source)) merged.set(chain.name, chain);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadChainsFromDirectory(dir: string, source: "user" | "project"): Promise<SubagentChainDefinition[]> {
  let entries: string[];
  try { entries = await readdir(dir); } catch { return []; }
  const files = entries.filter((entry) => entry.endsWith(".chain.md")).sort();
  const chains: SubagentChainDefinition[] = [];
  for (const file of files) {
    const path = join(dir, file);
    try {
      const raw = await readFile(path, "utf8");
      chains.push(parseChainMarkdown(raw, { path, source }));
    } catch {
      // ignore invalid chains
    }
  }
  return chains;
}

export function materializeChain(chain: SubagentChainDefinition, task: string): ChainTaskItem[] {
  return chain.steps.map((step) => ({ ...step, task: step.task.replace(/\{task\}/g, task) }));
}

function parseChainMarkdown(markdown: string, meta: { path?: string; source: "user" | "project" }): SubagentChainDefinition {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const name = typeof frontmatter.name === "string" && frontmatter.name.trim() ? frontmatter.name.trim() : deriveName(meta.path);
  const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : undefined;
  const steps = parseSections(body);
  if (!name) throw new Error("Chain missing name");
  if (steps.length === 0) throw new Error(`Chain ${name} has no steps`);
  return { name, description, steps, path: meta.path, source: meta.source };
}

function parseSections(body: string): ChainTaskItem[] {
  const matches = [...body.matchAll(/^##\s+([^\n]+)\n([\s\S]*?)(?=^##\s+|$)/gm)];
  return matches.map((match) => {
    const agent = match[1]?.trim() || "";
    const task = match[2]?.trim() || "";
    if (!agent || !task) throw new Error("Invalid chain step");
    return { agent, task };
  });
}

function splitFrontmatter(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return { frontmatter: {}, body: text.trim() };
  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---" || lines[i]?.trim() === "...") { end = i; break; }
  }
  if (end === -1) return { frontmatter: {}, body: text.trim() };
  const frontmatter: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return { frontmatter, body: lines.slice(end + 1).join("\n").trim() };
}

function deriveName(path?: string): string {
  const leaf = path?.split("/").pop() || "chain";
  return leaf.replace(/\.chain\.md$/, "");
}

function getProjectAgentDirs(cwd: string): string[] {
  const dirs: string[] = [];
  let current = resolve(cwd);
  while (true) {
    dirs.unshift(join(current, ".pi", "agents"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}
