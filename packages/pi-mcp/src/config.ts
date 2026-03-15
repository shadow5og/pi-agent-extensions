import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import type { LoadedMcpServerConfig, McpConfigFile, McpServerConfig } from "./types";

export function getGlobalMcpConfigPath(): string {
  return join(homedir(), ".pi", "agent", "mcp.json");
}

export function getProjectMcpConfigPath(cwd: string): string {
  return join(cwd, ".pi", "mcp.json");
}

export async function loadMergedMcpConfig(cwd: string): Promise<LoadedMcpServerConfig[]> {
  const global = await loadConfigFile(getGlobalMcpConfigPath(), "global");
  const project = await loadConfigFile(getProjectMcpConfigPath(cwd), "project");
  const merged = new Map<string, LoadedMcpServerConfig>();

  for (const entry of global) merged.set(entry.name, entry);
  for (const entry of project) merged.set(entry.name, entry);

  return [...merged.values()].filter((entry) => entry.enabled !== false);
}

export async function addGlobalServer(name: string, config: McpServerConfig): Promise<void> {
  const path = getGlobalMcpConfigPath();
  const parsed = await loadRawConfigFile(path);
  parsed.mcpServers[name] = config;
  await writeConfigFile(path, parsed);
}

export async function removeGlobalServer(name: string): Promise<boolean> {
  const path = getGlobalMcpConfigPath();
  const parsed = await loadRawConfigFile(path);
  if (!parsed.mcpServers[name]) return false;
  delete parsed.mcpServers[name];
  await writeConfigFile(path, parsed);
  return true;
}

async function loadConfigFile(path: string, source: "global" | "project"): Promise<LoadedMcpServerConfig[]> {
  const parsed = await loadRawConfigFile(path);
  return Object.entries(parsed.mcpServers).map(([name, config]) => ({
    name,
    source,
    ...config,
  }));
}

async function loadRawConfigFile(path: string): Promise<McpConfigFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<McpConfigFile>;
    return { mcpServers: parsed.mcpServers ?? {} };
  } catch {
    return { mcpServers: {} };
  }
}

async function writeConfigFile(path: string, config: McpConfigFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
