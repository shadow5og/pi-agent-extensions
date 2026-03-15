import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface FavoritesState {
  agents: string[];
  chains: string[];
}

const FAVORITES_PATH = join(homedir(), ".pi", "agent", "subagent-favorites.json");

export async function loadFavorites(): Promise<FavoritesState> {
  try {
    const raw = await readFile(FAVORITES_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<FavoritesState>;
    return {
      agents: Array.isArray(parsed.agents) ? parsed.agents.filter(isNonEmptyString) : [],
      chains: Array.isArray(parsed.chains) ? parsed.chains.filter(isNonEmptyString) : [],
    };
  } catch {
    return { agents: [], chains: [] };
  }
}

export async function saveFavorites(state: FavoritesState): Promise<void> {
  await mkdir(dirname(FAVORITES_PATH), { recursive: true });
  await writeFile(FAVORITES_PATH, JSON.stringify({
    agents: [...new Set(state.agents)].sort(),
    chains: [...new Set(state.chains)].sort(),
  }, null, 2) + "\n", "utf8");
}

export async function toggleFavorite(kind: keyof FavoritesState, name: string): Promise<boolean> {
  const state = await loadFavorites();
  const set = new Set(state[kind]);
  let nowFavorite: boolean;
  if (set.has(name)) {
    set.delete(name);
    nowFavorite = false;
  } else {
    set.add(name);
    nowFavorite = true;
  }
  state[kind] = [...set].sort();
  await saveFavorites(state);
  return nowFavorite;
}

export function isFavorite(state: FavoritesState, kind: keyof FavoritesState, name: string): boolean {
  return state[kind].includes(name);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
