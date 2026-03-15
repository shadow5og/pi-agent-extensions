import type { ExtensionAPI, SlashCommandHandlerContext } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";

import { discoverAgents, type LoadedAgentDefinition } from "./agents";
import { discoverChains, materializeChain, type SubagentChainDefinition } from "./chains";
import { createCmuxTaskHandle } from "./cmux";
import { executeSubagentRun } from "./execution";
import { isFavorite, loadFavorites, toggleFavorite, type FavoritesState } from "./favorites";
import { appendRunHistory, formatHistoryLabel, getRunHistory, type HistoryEntryData } from "./history";
import { renderAgentDetail, renderChainDetail, renderHistoryDetail, renderSubagentResult } from "./render";
import type { SubagentParams, SubagentRunResult } from "./schema";

export function registerSubagentCommands(pi: ExtensionAPI) {
  let cachedCwd = process.cwd();
  let cachedAgents: LoadedAgentDefinition[] = [];
  let cachedChains: SubagentChainDefinition[] = [];
  let cachedFavorites: FavoritesState = { agents: [], chains: [] };

  const refreshState = async (cwd: string) => {
    cachedCwd = cwd;
    cachedFavorites = await loadFavorites();
    cachedAgents = sortAgents((await discoverAgents(cwd)), cachedFavorites);
    cachedChains = sortChains(await discoverChains(cwd), cachedFavorites);
  };

  const ensureState = async (ctx: SlashCommandHandlerContext) => {
    if (ctx.cwd !== cachedCwd || cachedAgents.length === 0) {
      await refreshState(ctx.cwd);
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    await refreshState(ctx.cwd);
  });

  pi.registerMessageRenderer("subagent-run", (message, options, theme) => renderSubagentResult(message.details as SubagentRunResult | undefined, options, theme));
  pi.registerMessageRenderer("subagent-agent-detail", (message, _options, theme) => renderAgentDetail(message.details as LoadedAgentDefinition, theme));
  pi.registerMessageRenderer("subagent-chain-detail", (message, _options, theme) => renderChainDetail(message.details as SubagentChainDefinition, theme));
  pi.registerMessageRenderer("subagent-history-detail", (message, _options, theme) => renderHistoryDetail(message.details as HistoryEntryData, theme));

  pi.registerCommand("agents", {
    description: "Browse discovered subagents, inspect them, favorite them, or insert a /run command",
    handler: async (_args, ctx) => {
      await ensureState(ctx);
      if (cachedAgents.length === 0) {
        ctx.ui.notify("No subagents discovered.", "warning");
        return;
      }
      if (!(ctx as any).hasUI) {
        process.stdout.write(cachedAgents.map((agent) => formatAgentLabel(agent, cachedFavorites)).join("\n") + "\n");
        return;
      }
      const choice = await ctx.ui.select("Select a subagent", cachedAgents.map((agent) => formatAgentLabel(agent, cachedFavorites)));
      if (!choice) return;
      const selected = cachedAgents.find((agent) => formatAgentLabel(agent, cachedFavorites) === choice);
      if (!selected) return;
      const favorite = isFavorite(cachedFavorites, "agents", selected.definition.name);
      const action = await ctx.ui.select("Subagent action", ["Run", "Inspect", "Insert /run", favorite ? "Unfavorite" : "Favorite"]);
      if (!action) return;
      if (action === "Inspect") {
        pi.sendMessage({ customType: "subagent-agent-detail", content: selected.definition.name, display: true, details: selected });
        return;
      }
      if (action === "Insert /run") {
        ctx.ui.setEditorText(`/run ${selected.definition.name} `);
        ctx.ui.notify(`Inserted /run ${selected.definition.name} into the editor.`, "success");
        return;
      }
      if (action === "Favorite" || action === "Unfavorite") {
        const nowFavorite = await toggleFavorite("agents", selected.definition.name);
        await refreshState(ctx.cwd);
        ctx.ui.notify(`${selected.definition.name} ${nowFavorite ? "favorited" : "unfavorited"}.`, "success");
        return;
      }
      ctx.ui.setEditorText(`/run ${selected.definition.name} `);
      ctx.ui.notify(`Inserted /run ${selected.definition.name} into the editor.`, "success");
    },
  });

  pi.registerCommand("favorite-agent", {
    description: "Toggle favorite status for an agent: /favorite-agent <name>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items = cachedAgents.filter((agent) => agent.definition.name.startsWith(prefix)).map((agent) => ({ value: agent.definition.name, label: formatAgentLabel(agent, cachedFavorites) }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /favorite-agent <name>", "warning");
        return;
      }
      const selected = cachedAgents.find((agent) => agent.definition.name === name);
      if (!selected) {
        ctx.ui.notify(`Unknown subagent: ${name}`, "error");
        return;
      }
      const nowFavorite = await toggleFavorite("agents", name);
      await refreshState(ctx.cwd);
      if ((ctx as any).hasUI) ctx.ui.notify(`${name} ${nowFavorite ? "favorited" : "unfavorited"}.`, "success");
      else process.stdout.write(`${name} ${nowFavorite ? "favorited" : "unfavorited"}.\n`);
    },
  });

  pi.registerCommand("inspect-agent", {
    description: "Inspect an agent definition: /inspect-agent <name>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items = cachedAgents.filter((agent) => agent.definition.name.startsWith(prefix)).map((agent) => ({ value: agent.definition.name, label: formatAgentLabel(agent, cachedFavorites) }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /inspect-agent <name>", "warning");
        return;
      }
      const selected = cachedAgents.find((agent) => agent.definition.name === name);
      if (!selected) {
        ctx.ui.notify(`Unknown subagent: ${name}`, "error");
        return;
      }
      if ((ctx as any).hasUI) {
        pi.sendMessage({ customType: "subagent-agent-detail", content: selected.definition.name, display: true, details: selected });
      } else {
        process.stdout.write(`${selected.definition.name} — ${selected.definition.description}\n`);
        process.stdout.write(`model: ${selected.definition.model ?? "default"}${selected.definition.thinking ? `:${selected.definition.thinking}` : ""}\n`);
        process.stdout.write(`tools: ${(selected.resolvedTools ?? []).join(", ") || "inherit"}\n`);
      }
    },
  });

  pi.registerCommand("chains", {
    description: "Browse discovered chain definitions, inspect them, favorite them, or insert a /run-chain command",
    handler: async (_args, ctx) => {
      await ensureState(ctx);
      if (cachedChains.length === 0) {
        ctx.ui.notify("No chains discovered.", "warning");
        return;
      }
      if (!(ctx as any).hasUI) {
        process.stdout.write(cachedChains.map((chain) => formatChainLabel(chain, cachedFavorites)).join("\n") + "\n");
        return;
      }
      const choice = await ctx.ui.select("Select a chain", cachedChains.map((chain) => formatChainLabel(chain, cachedFavorites)));
      if (!choice) return;
      const selected = cachedChains.find((chain) => formatChainLabel(chain, cachedFavorites) === choice);
      if (!selected) return;
      const favorite = isFavorite(cachedFavorites, "chains", selected.name);
      const action = await ctx.ui.select("Chain action", ["Run", "Inspect", "Insert /run-chain", favorite ? "Unfavorite" : "Favorite"]);
      if (!action) return;
      if (action === "Inspect") {
        pi.sendMessage({ customType: "subagent-chain-detail", content: selected.name, display: true, details: selected });
        return;
      }
      if (action === "Insert /run-chain") {
        ctx.ui.setEditorText(`/run-chain ${selected.name} `);
        ctx.ui.notify(`Inserted /run-chain ${selected.name} into the editor.`, "success");
        return;
      }
      if (action === "Favorite" || action === "Unfavorite") {
        const nowFavorite = await toggleFavorite("chains", selected.name);
        await refreshState(ctx.cwd);
        ctx.ui.notify(`${selected.name} ${nowFavorite ? "favorited" : "unfavorited"}.`, "success");
        return;
      }
      ctx.ui.setEditorText(`/run-chain ${selected.name} `);
      ctx.ui.notify(`Inserted /run-chain ${selected.name} into the editor.`, "success");
    },
  });

  pi.registerCommand("favorite-chain", {
    description: "Toggle favorite status for a chain: /favorite-chain <name>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items = cachedChains.filter((chain) => chain.name.startsWith(prefix)).map((chain) => ({ value: chain.name, label: formatChainLabel(chain, cachedFavorites) }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /favorite-chain <name>", "warning");
        return;
      }
      const selected = cachedChains.find((chain) => chain.name === name);
      if (!selected) {
        ctx.ui.notify(`Unknown chain: ${name}`, "error");
        return;
      }
      const nowFavorite = await toggleFavorite("chains", name);
      await refreshState(ctx.cwd);
      if ((ctx as any).hasUI) ctx.ui.notify(`${name} ${nowFavorite ? "favorited" : "unfavorited"}.`, "success");
      else process.stdout.write(`${name} ${nowFavorite ? "favorited" : "unfavorited"}.\n`);
    },
  });

  pi.registerCommand("inspect-chain", {
    description: "Inspect a chain definition: /inspect-chain <name>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items = cachedChains.filter((chain) => chain.name.startsWith(prefix)).map((chain) => ({ value: chain.name, label: formatChainLabel(chain, cachedFavorites) }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /inspect-chain <name>", "warning");
        return;
      }
      const selected = cachedChains.find((chain) => chain.name === name);
      if (!selected) {
        ctx.ui.notify(`Unknown chain: ${name}`, "error");
        return;
      }
      if ((ctx as any).hasUI) {
        pi.sendMessage({ customType: "subagent-chain-detail", content: selected.name, display: true, details: selected });
      } else {
        process.stdout.write(`${selected.name}${selected.description ? ` — ${selected.description}` : ""}\n`);
        process.stdout.write(selected.steps.map((step, index) => `${index + 1}. ${step.agent} -- ${step.task}`).join("\n") + "\n");
      }
    },
  });

  pi.registerCommand("subagent-history", {
    description: "Browse recent subagent runs from this session and prefill or inspect them",
    handler: async (_args, ctx) => {
      const history = getRunHistory(ctx);
      if (history.length === 0) {
        if ((ctx as any).hasUI) ctx.ui.notify("No subagent history in this session yet.", "warning");
        else process.stdout.write("No subagent history in this session yet.\n");
        return;
      }
      if (!(ctx as any).hasUI) {
        process.stdout.write(history.slice(0, 20).map(formatHistoryLabel).join("\n") + "\n");
        return;
      }
      const recent = history.slice(0, 30);
      const choice = await ctx.ui.select("Recent subagent runs", recent.map(formatHistoryLabel));
      if (!choice) return;
      const selected = recent.find((item) => formatHistoryLabel(item) === choice);
      if (!selected) return;
      const action = await ctx.ui.select("History action", ["Prefill rerun", "Inspect"]);
      if (!action) return;
      if (action === "Inspect") {
        pi.sendMessage({ customType: "subagent-history-detail", content: selected.summary, display: true, details: selected });
        return;
      }
      ctx.ui.setEditorText(toEditorCommand(selected.label, selected.params));
      ctx.ui.notify("Inserted rerun command into the editor.", "success");
    },
  });

  pi.registerCommand("run", {
    description: "Run a subagent directly: /run <agent> <task>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const [first, second] = splitFirstToken(prefix);
      if (second !== undefined) return null;
      const items = cachedAgents.filter((agent) => agent.definition.name.startsWith(first)).map((agent) => ({ value: agent.definition.name, label: formatAgentLabel(agent, cachedFavorites) }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const parsed = parseRunArgs(args);
      if (!parsed || !parsed.task) {
        ctx.ui.notify("Usage: /run <agent> <task>", "warning");
        return;
      }
      const found = cachedAgents.find((agent) => agent.definition.name === parsed.agent);
      if (!found) {
        ctx.ui.notify(`Unknown subagent: ${parsed.agent}`, "error");
        return;
      }
      await runAndDisplay(pi, ctx, { mode: "single", agent: parsed.agent, task: parsed.task }, `/run ${parsed.agent}`);
    },
  });

  pi.registerCommand("parallel", {
    description: "Run subagents directly in parallel: /parallel agent -- task -> agent -- task",
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const parsed = parseMultiArgs(args);
      if (!parsed || parsed.length === 0) {
        ctx.ui.notify("Usage: /parallel agent -- task -> agent -- task", "warning");
        return;
      }
      const unknown = parsed.find((item) => !cachedAgents.some((agent) => agent.definition.name === item.agent));
      if (unknown) {
        ctx.ui.notify(`Unknown subagent: ${unknown.agent}`, "error");
        return;
      }
      await runAndDisplay(pi, ctx, { mode: "parallel", tasks: parsed }, "/parallel");
    },
  });

  pi.registerCommand("chain", {
    description: "Run a sequential chain directly: /chain agent -- task -> agent -- task",
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const parsed = parseMultiArgs(args);
      if (!parsed || parsed.length === 0) {
        ctx.ui.notify("Usage: /chain agent -- task -> agent -- task", "warning");
        return;
      }
      const unknown = parsed.find((item) => !cachedAgents.some((agent) => agent.definition.name === item.agent));
      if (unknown) {
        ctx.ui.notify(`Unknown subagent: ${unknown.agent}`, "error");
        return;
      }
      await runAndDisplay(pi, ctx, { mode: "chain", chain: parsed }, "/chain");
    },
  });

  pi.registerCommand("run-chain", {
    description: "Run a reusable chain definition: /run-chain <name> [task]",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const [first, second] = splitFirstToken(prefix);
      if (second !== undefined) return null;
      const items = cachedChains.filter((chain) => chain.name.startsWith(first)).map((chain) => ({ value: chain.name, label: formatChainLabel(chain, cachedFavorites) }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const parsed = parseRunArgs(args);
      const chainName = parsed?.agent ?? args.trim();
      const task = parsed?.task ?? "";
      if (!chainName) {
        ctx.ui.notify("Usage: /run-chain <name> [task]", "warning");
        return;
      }
      const found = cachedChains.find((chain) => chain.name === chainName);
      if (!found) {
        ctx.ui.notify(`Unknown chain: ${chainName}`, "error");
        return;
      }
      const materialized = materializeChain(found, task);
      await runAndDisplay(pi, ctx, { mode: "chain", chain: materialized }, `/run-chain ${chainName}`);
    },
  });
}

async function runAndDisplay(pi: ExtensionAPI, ctx: SlashCommandHandlerContext, params: SubagentParams, label: string) {
  const taskHandle = await createCmuxTaskHandle(label);
  if ((ctx as any).hasUI) ctx.ui.notify(`Running ${label}...`, "info");
  try {
    const { summary, result } = await executeSubagentRun(params, ctx.cwd, undefined, undefined, taskHandle);
    appendRunHistory(pi, { timestamp: Date.now(), label, cwd: ctx.cwd, params, summary, result });
    if ((ctx as any).hasUI) pi.sendMessage({ customType: "subagent-run", content: summary, display: true, details: result });
    else process.stdout.write(`${summary}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown subagent error.";
    await taskHandle.finish(false, `${label} failed: ${message}`);
    if ((ctx as any).hasUI) ctx.ui.notify(`${label} failed: ${message}`, "error");
    else process.stdout.write(`${label} failed: ${message}\n`);
  }
}

function sortAgents(agents: LoadedAgentDefinition[], favorites: FavoritesState): LoadedAgentDefinition[] {
  return [...agents].sort((a, b) => {
    const af = isFavorite(favorites, "agents", a.definition.name) ? 0 : 1;
    const bf = isFavorite(favorites, "agents", b.definition.name) ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.definition.name.localeCompare(b.definition.name);
  });
}

function sortChains(chains: SubagentChainDefinition[], favorites: FavoritesState): SubagentChainDefinition[] {
  return [...chains].sort((a, b) => {
    const af = isFavorite(favorites, "chains", a.name) ? 0 : 1;
    const bf = isFavorite(favorites, "chains", b.name) ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name);
  });
}

function formatAgentLabel(agent: LoadedAgentDefinition, favorites: FavoritesState): string {
  const star = isFavorite(favorites, "agents", agent.definition.name) ? "★ " : "";
  return `${star}${agent.definition.name}${agent.definition.description ? ` — ${agent.definition.description}` : ""}`;
}

function formatChainLabel(chain: SubagentChainDefinition, favorites: FavoritesState): string {
  const star = isFavorite(favorites, "chains", chain.name) ? "★ " : "";
  return `${star}${chain.name}${chain.description ? ` — ${chain.description}` : ""}`;
}

function toEditorCommand(label: string, params: SubagentParams): string {
  if (params.mode === "single" || (params.agent && params.task)) return `/run ${params.agent} ${params.task}`.trim();
  if (params.mode === "parallel" && params.tasks?.length) return `/parallel ${params.tasks.map((item) => `${item.agent} -- ${item.task}`).join(" -> ")}`;
  if (params.mode === "chain" && params.chain?.length) {
    if (label.startsWith("/run-chain ")) return `${label} `;
    return `/chain ${params.chain.map((item) => `${item.agent} -- ${item.task}`).join(" -> ")}`;
  }
  return label;
}

function splitFirstToken(value: string): [string, string | undefined] {
  const trimmed = value.trimStart();
  const space = trimmed.indexOf(" ");
  if (space === -1) return [trimmed, undefined];
  return [trimmed.slice(0, space), trimmed.slice(space + 1)];
}

function parseRunArgs(args: string): { agent: string; task: string } | null {
  const trimmed = args.trim();
  if (!trimmed) return null;
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return { agent: trimmed, task: "" };
  const agent = trimmed.slice(0, firstSpace).trim();
  const task = trimmed.slice(firstSpace + 1).trim();
  if (!agent) return null;
  return { agent, task };
}

function parseMultiArgs(args: string): Array<{ agent: string; task: string }> | null {
  const parts = args.split(/\s*->\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const items: Array<{ agent: string; task: string }> = [];
  for (const part of parts) {
    const sep = part.indexOf("--");
    if (sep === -1) return null;
    const agent = part.slice(0, sep).trim();
    const task = part.slice(sep + 2).trim();
    if (!agent || !task) return null;
    items.push({ agent, task });
  }
  return items;
}
