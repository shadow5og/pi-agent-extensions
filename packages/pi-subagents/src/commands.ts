import type { ExtensionAPI, SlashCommandHandlerContext } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";

import { discoverAgents } from "./agents";
import { discoverChains, materializeChain, type SubagentChainDefinition } from "./chains";
import { createCmuxTaskHandle } from "./cmux";
import { executeSubagentRun } from "./execution";
import { renderSubagentResult } from "./render";
import type { SubagentParams, SubagentRunResult } from "./schema";

interface CachedAgentItem {
  name: string;
  description: string;
}

export function registerSubagentCommands(pi: ExtensionAPI) {
  let cachedCwd = process.cwd();
  let cachedAgents: CachedAgentItem[] = [];
  let cachedChains: SubagentChainDefinition[] = [];

  const refreshState = async (cwd: string) => {
    cachedCwd = cwd;
    const loaded = await discoverAgents(cwd);
    cachedAgents = loaded
      .map((item) => ({ name: item.definition.name, description: item.definition.description }))
      .sort((a, b) => a.name.localeCompare(b.name));
    cachedChains = await discoverChains(cwd);
  };

  const ensureState = async (ctx: SlashCommandHandlerContext) => {
    if (ctx.cwd !== cachedCwd || cachedAgents.length === 0) {
      await refreshState(ctx.cwd);
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    await refreshState(ctx.cwd);
  });

  pi.registerMessageRenderer("subagent-run", (message, options, theme) => {
    const details = message.details as SubagentRunResult | undefined;
    return renderSubagentResult(details, options, theme);
  });

  pi.registerCommand("agents", {
    description: "Browse discovered subagents and insert a /run command",
    handler: async (_args, ctx) => {
      await ensureState(ctx);
      if (cachedAgents.length === 0) {
        ctx.ui.notify("No subagents discovered.", "warning");
        return;
      }
      const choice = await ctx.ui.select("Select a subagent", cachedAgents.map((agent) => `${agent.name}${agent.description ? ` — ${agent.description}` : ""}`));
      if (!choice) return;
      const selected = cachedAgents.find((agent) => choice.startsWith(`${agent.name}`));
      if (!selected) {
        ctx.ui.notify("Could not resolve selected subagent.", "error");
        return;
      }
      ctx.ui.setEditorText(`/run ${selected.name} `);
      ctx.ui.notify(`Inserted /run ${selected.name} into the editor.`, "success");
    },
  });

  pi.registerCommand("chains", {
    description: "Browse discovered chain definitions and insert a /run-chain command",
    handler: async (_args, ctx) => {
      await ensureState(ctx);
      if (cachedChains.length === 0) {
        ctx.ui.notify("No chains discovered.", "warning");
        return;
      }
      const choice = await ctx.ui.select("Select a chain", cachedChains.map((chain) => `${chain.name}${chain.description ? ` — ${chain.description}` : ""}`));
      if (!choice) return;
      const selected = cachedChains.find((chain) => choice.startsWith(`${chain.name}`));
      if (!selected) {
        ctx.ui.notify("Could not resolve selected chain.", "error");
        return;
      }
      ctx.ui.setEditorText(`/run-chain ${selected.name} `);
      ctx.ui.notify(`Inserted /run-chain ${selected.name} into the editor.`, "success");
    },
  });

  pi.registerCommand("run", {
    description: "Run a subagent directly: /run <agent> <task>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const [first, second] = splitFirstToken(prefix);
      if (second !== undefined) return null;
      const items = cachedAgents.filter((agent) => agent.name.startsWith(first)).map((agent) => ({ value: agent.name, label: `${agent.name}${agent.description ? ` — ${agent.description}` : ""}` }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      await ensureState(ctx);
      const parsed = parseRunArgs(args);
      if (!parsed) {
        ctx.ui.notify("Usage: /run <agent> <task>", "warning");
        return;
      }
      const found = cachedAgents.find((agent) => agent.name === parsed.agent);
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
      const unknown = parsed.find((item) => !cachedAgents.some((agent) => agent.name === item.agent));
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
      const unknown = parsed.find((item) => !cachedAgents.some((agent) => agent.name === item.agent));
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
      const items = cachedChains.filter((chain) => chain.name.startsWith(first)).map((chain) => ({ value: chain.name, label: `${chain.name}${chain.description ? ` — ${chain.description}` : ""}` }));
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
  if ((ctx as any).hasUI) {
    ctx.ui.notify(`Running ${label}...`, "info");
  }
  try {
    const { summary, result } = await executeSubagentRun(params, ctx.cwd, undefined, undefined, taskHandle);
    if ((ctx as any).hasUI) {
      pi.sendMessage({
        customType: "subagent-run",
        content: summary,
        display: true,
        details: result,
      });
    } else {
      process.stdout.write(`${summary}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown subagent error.";
    await taskHandle.finish(false, `${label} failed: ${message}`);
    if ((ctx as any).hasUI) {
      ctx.ui.notify(`${label} failed: ${message}`, "error");
    } else {
      process.stdout.write(`${label} failed: ${message}\n`);
    }
  }
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
