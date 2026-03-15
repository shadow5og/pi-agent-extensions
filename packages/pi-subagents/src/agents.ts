import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_SUBAGENTS,
  READ_ONLY_TOOLS,
  resolveToolList,
  type AgentSource,
  type DelegatePolicy,
  type SubagentDefinition,
  type ToolPolicy,
} from "./schema";

export interface AgentSourceMetadata {
  source: AgentSource;
  path?: string;
}

export interface LoadedAgentDefinition {
  definition: SubagentDefinition;
  metadata: AgentSourceMetadata;
  resolvedTools?: string[];
}

export interface ParseAgentMarkdownOptions {
  source?: AgentSource;
  path?: string;
}

export interface DiscoverAgentsOptions {
  includeDefaults?: boolean;
  includeUser?: boolean;
  includeProject?: boolean;
}

const DEFAULT_SOURCE: AgentSource = "unknown";

export function getUserAgentsDir(): string {
  return join(homedir(), ".pi", "agent", "agents");
}

export function getProjectAgentsDir(cwd: string): string {
  return join(cwd, ".pi", "agents");
}

export function loadDefaultAgents(): LoadedAgentDefinition[] {
  return DEFAULT_SUBAGENTS.map((definition) => {
    const normalized = normalizeAgentDefinition(definition, {
      source: definition.source ?? "extension",
    });

    return {
      definition: normalized,
      metadata: {
        source: normalized.source ?? "extension",
      },
      resolvedTools: resolveToolList(normalized),
    };
  });
}

export async function loadAgentFile(path: string, options: ParseAgentMarkdownOptions = {}): Promise<LoadedAgentDefinition> {
  const markdown = await readFile(path, "utf8");
  return parseAgentMarkdown(markdown, { ...options, path });
}

export async function loadAgentsFromDirectory(dir: string, source: AgentSource): Promise<LoadedAgentDefinition[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const files = entries.filter((entry) => entry.endsWith(".md")).sort();
  const loaded: LoadedAgentDefinition[] = [];

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      loaded.push(await loadAgentFile(filePath, { source, path: filePath }));
    } catch {
      // Skip invalid agent files for now; callers can add stricter reporting later.
    }
  }

  return loaded;
}

export async function discoverAgents(
  cwd: string,
  options: DiscoverAgentsOptions = {},
): Promise<LoadedAgentDefinition[]> {
  const {
    includeDefaults = true,
    includeUser = true,
    includeProject = true,
  } = options;

  const groups: LoadedAgentDefinition[][] = [];
  if (includeDefaults) groups.push(loadDefaultAgents());
  if (includeUser) groups.push(await loadAgentsFromDirectory(getUserAgentsDir(), "user"));
  if (includeProject) groups.push(await loadAgentsFromDirectory(getProjectAgentsDir(cwd), "project"));

  return mergeAgentsByName(...groups);
}

export function createAgentMap(agents: LoadedAgentDefinition[]): Map<string, LoadedAgentDefinition> {
  return new Map(agents.map((agent) => [agent.definition.name, agent]));
}

export function parseAgentMarkdown(markdown: string, options: ParseAgentMarkdownOptions = {}): LoadedAgentDefinition {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const source = normalizeSource(frontmatter.source) ?? options.source ?? DEFAULT_SOURCE;

  const definition = normalizeAgentDefinition(
    {
      ...frontmatter,
      systemPrompt: body,
      source,
    },
    { source, path: options.path },
  );

  return {
    definition,
    metadata: {
      source,
      path: options.path,
    },
    resolvedTools: resolveToolList(definition),
  };
}

export function mergeAgentsByName(...groups: Array<LoadedAgentDefinition[] | undefined>): LoadedAgentDefinition[] {
  const merged = new Map<string, LoadedAgentDefinition>();

  for (const group of groups) {
    if (!group) continue;
    for (const agent of group) {
      merged.set(agent.definition.name, agent);
    }
  }

  return [...merged.values()];
}

export function normalizeAgentDefinition(
  input: Partial<SubagentDefinition>,
  metadata: AgentSourceMetadata = { source: DEFAULT_SOURCE },
): SubagentDefinition {
  const name = asNonEmptyString(input.name);
  if (!name) throw new Error(`Agent definition is missing 'name'${formatSource(metadata)}.`);

  const description = asNonEmptyString(input.description);
  if (!description) throw new Error(`Agent '${name}' is missing 'description'${formatSource(metadata)}.`);

  const systemPrompt = asString(input.systemPrompt)?.trim();
  if (!systemPrompt) {
    throw new Error(`Agent '${name}' is missing markdown body/systemPrompt${formatSource(metadata)}.`);
  }

  const definition: SubagentDefinition = {
    name,
    description,
    systemPrompt,
    mode: input.mode === "primary" || input.mode === "subagent" || input.mode === "all" ? input.mode : "subagent",
    hidden: Boolean(input.hidden),
    contextMode:
      input.contextMode === "fresh" || input.contextMode === "resume" || input.contextMode === "fork"
        ? input.contextMode
        : "fresh",
    delegatePolicy: normalizeDelegatePolicy(input.delegatePolicy),
    allowWrite: Boolean(input.allowWrite),
    allowBash: Boolean(input.allowBash),
    tags: normalizeStringList(input.tags),
    source: normalizeSource(input.source) ?? metadata.source,
  };

  const model = asNonEmptyString(input.model);
  if (model) definition.model = model;

  const maxSteps = normalizeMaxSteps(input.maxSteps);
  if (maxSteps !== undefined) definition.maxSteps = maxSteps;

  const tools = normalizeToolPolicy(input.tools);
  if (tools) definition.tools = tools;

  return definition;
}

type FrontmatterValue = string | number | boolean | null | FrontmatterValue[] | Record<string, FrontmatterValue>;

function splitFrontmatter(markdown: string): { frontmatter: Record<string, FrontmatterValue>; body: string } {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n") && text !== "---") {
    return { frontmatter: {}, body: text.trim() };
  }

  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (line === "---" || line === "...") {
      end = i;
      break;
    }
  }

  if (end === -1) {
    return { frontmatter: {}, body: text.trim() };
  }

  return {
    frontmatter: parseSimpleYaml(lines.slice(1, end)),
    body: lines.slice(end + 1).join("\n").trim(),
  };
}

function parseSimpleYaml(lines: string[]): Record<string, FrontmatterValue> {
  const result: Record<string, FrontmatterValue> = {};
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index] ?? "";
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      index += 1;
      continue;
    }

    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      index += 1;
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rest = trimmed.slice(separator + 1).trim();

    if (rest) {
      result[key] = parseScalar(rest);
      index += 1;
      continue;
    }

    const childLines: string[] = [];
    let next = index + 1;
    while (next < lines.length) {
      const childRaw = lines[next] ?? "";
      if (!childRaw.trim()) {
        next += 1;
        continue;
      }
      if (!childRaw.startsWith("  ")) break;
      childLines.push(childRaw.slice(2));
      next += 1;
    }

    if (childLines.length === 0) {
      result[key] = null;
    } else if (childLines.every((line) => line.trim().startsWith("- "))) {
      result[key] = childLines
        .map((line) => line.trim().slice(2).trim())
        .filter(Boolean)
        .map(parseScalar);
    } else {
      result[key] = parseSimpleYaml(childLines);
    }

    index = next;
  }

  return result;
}

function parseScalar(value: string): FrontmatterValue {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parseScalar);
  }

  return value;
}

function normalizeToolPolicy(value: unknown): ToolPolicy | undefined {
  if (!value) return undefined;

  if (Array.isArray(value)) {
    const tools = normalizeStringList(value);
    return tools.length ? { type: "fixed", tools } : undefined;
  }

  if (typeof value === "string") {
    if (value === "inherit") return { type: "inherit" };
    if (value === "readOnly") return { type: "readOnly" };
    return { type: "fixed", tools: [value] };
  }

  if (!isRecord(value)) return undefined;

  if (value.type === "inherit") return { type: "inherit" };
  if (value.type === "readOnly") return { type: "readOnly" };

  const tools = normalizeStringList(value.tools);
  if (value.type === "fixed") {
    return { type: "fixed", tools: tools.length ? tools : [...READ_ONLY_TOOLS] };
  }

  return tools.length ? { type: "fixed", tools } : undefined;
}

function normalizeDelegatePolicy(value: unknown): DelegatePolicy {
  if (value === "none") return { type: "none" };
  if (!isRecord(value)) return { type: "none" };

  if (value.type === "allowlist") {
    return { type: "allowlist", agents: normalizeStringList(value.agents) };
  }

  if (value.type === "pattern") {
    return { type: "pattern", patterns: normalizeStringList(value.patterns) };
  }

  return { type: "none" };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asNonEmptyString).filter((item): item is string => Boolean(item));
}

function normalizeMaxSteps(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.floor(value);
  return rounded >= 1 ? rounded : undefined;
}

function normalizeSource(value: unknown): AgentSource | undefined {
  return value === "user" || value === "project" || value === "extension" || value === "unknown"
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatSource(metadata: AgentSourceMetadata): string {
  return metadata.path ? ` at ${metadata.path}` : "";
}
