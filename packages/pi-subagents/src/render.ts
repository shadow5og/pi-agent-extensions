import { Container, Spacer, Text } from "@mariozechner/pi-tui";

import type { LoadedAgentDefinition } from "./agents";
import type { SubagentChainDefinition } from "./chains";
import type { HistoryEntryData } from "./history";
import { inferRequestedMode, type ChainTaskItem, type ParallelTaskItem, type SubagentParams, type SubagentRunResult, type SubagentTaskResult } from "./schema";

export function renderSubagentCall(args: SubagentParams, theme: any) {
  const mode = inferRequestedMode(args);
  if (mode === "single") {
    const text = `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", args.agent || "unknown")}\n  ${theme.fg("dim", truncate(args.task || "", 80))}`;
    return new Text(text, 0, 0);
  }
  if (mode === "parallel") {
    const tasks = (args.tasks || []) as ParallelTaskItem[];
    let text = `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", `parallel (${tasks.length})`)}`;
    for (const task of tasks.slice(0, 3)) text += `\n  ${theme.fg("accent", task.agent)} ${theme.fg("dim", truncate(task.task, 50))}`;
    return new Text(text, 0, 0);
  }
  const chain = (args.chain || []) as ChainTaskItem[];
  let text = `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", `chain (${chain.length})`)}`;
  for (const task of chain.slice(0, 3)) text += `\n  ${theme.fg("accent", task.agent)} ${theme.fg("dim", truncate(task.task, 50))}`;
  return new Text(text, 0, 0);
}

export function renderSubagentResult(result: SubagentRunResult | undefined, options: { expanded?: boolean }, theme: any) {
  if (!result) return new Text("(no output)", 0, 0);
  const container = new Container();
  const completed = result.results.filter((item) => item.status === "completed").length;
  const failed = result.results.filter((item) => item.status === "failed").length;
  const running = result.results.filter((item) => item.status === "running").length;
  const header = `${statusIcon(result.status)} ${theme.fg("toolTitle", theme.bold(`subagent ${result.mode}`))} ${theme.fg("muted", `(${completed}/${result.results.length} completed${failed ? `, ${failed} failed` : ""}${running ? `, ${running} running` : ""})`)}`;
  container.addChild(new Text(header, 0, 0));
  container.addChild(new Spacer(1));
  for (const item of result.results) {
    const line = `${statusIcon(item.status)} ${theme.fg("accent", item.agent)}${item.step ? theme.fg("muted", ` [step ${item.step}]`) : ""} ${theme.fg("dim", truncate(item.task, options.expanded ? 200 : 80))}`;
    container.addChild(new Text(line, 0, 0));
    if (item.errorMessage) container.addChild(new Text(theme.fg("error", `  ${item.errorMessage}`), 0, 0));
    else if (item.finalOutput) container.addChild(new Text(theme.fg("muted", `  ${truncate(item.finalOutput, options.expanded ? 300 : 120)}`), 0, 0));
    if (options.expanded && item.transcript?.length) {
      const transcriptLines = item.transcript.slice(-6).map((entry) => entry.toolName && entry.role === "assistant" ? `  → ${entry.toolName}${entry.text ? `: ${truncate(entry.text, 80)}` : ""}` : `  · ${truncate(entry.text || "", 100)}`);
      for (const transcriptLine of transcriptLines) container.addChild(new Text(theme.fg("dim", transcriptLine), 0, 0));
    }
    if (item.usage && options.expanded) container.addChild(new Text(theme.fg("muted", `  usage ↑${item.usage.input} ↓${item.usage.output}${item.usage.cost ? ` $${item.usage.cost.toFixed(4)}` : ""}`), 0, 0));
    container.addChild(new Spacer(1));
  }
  return container;
}

export function renderAgentDetail(agent: LoadedAgentDefinition, theme: any) {
  const c = new Container();
  const d = agent.definition;
  c.addChild(new Text(`${theme.fg("toolTitle", theme.bold("agent "))}${theme.fg("accent", d.name)}`, 0, 0));
  c.addChild(new Text(theme.fg("muted", d.description), 0, 0));
  c.addChild(new Spacer(1));
  c.addChild(new Text(`source: ${d.source ?? agent.metadata.source}${agent.metadata.path ? ` — ${agent.metadata.path}` : ""}`, 0, 0));
  c.addChild(new Text(`model: ${d.model ?? "default"}${d.thinking ? `:${d.thinking}` : ""}`, 0, 0));
  c.addChild(new Text(`tools: ${(agent.resolvedTools ?? []).join(", ") || "inherit"}`, 0, 0));
  c.addChild(new Text(`skills: ${d.skills?.join(", ") || "none"}`, 0, 0));
  c.addChild(new Text(`writes: ${d.allowWrite ? "yes" : "no"}  bash: ${d.allowBash ? "yes" : "no"}  maxSteps: ${d.maxSteps ?? "default"}`, 0, 0));
  if (d.tags?.length) c.addChild(new Text(`tags: ${d.tags.join(", ")}`, 0, 0));
  c.addChild(new Spacer(1));
  c.addChild(new Text(theme.fg("dim", truncate(d.systemPrompt.trim(), 500)), 0, 0));
  return c;
}

export function renderChainDetail(chain: SubagentChainDefinition, theme: any) {
  const c = new Container();
  c.addChild(new Text(`${theme.fg("toolTitle", theme.bold("chain "))}${theme.fg("accent", chain.name)}`, 0, 0));
  if (chain.description) c.addChild(new Text(theme.fg("muted", chain.description), 0, 0));
  c.addChild(new Spacer(1));
  c.addChild(new Text(`source: ${chain.source}${chain.path ? ` — ${chain.path}` : ""}`, 0, 0));
  c.addChild(new Text(`steps: ${chain.steps.length}`, 0, 0));
  c.addChild(new Spacer(1));
  chain.steps.forEach((step, index) => {
    c.addChild(new Text(`${index + 1}. ${step.agent}`, 0, 0));
    c.addChild(new Text(theme.fg("dim", `   ${truncate(step.task, 220)}`), 0, 0));
  });
  return c;
}

export function renderHistoryDetail(item: HistoryEntryData, theme: any) {
  const c = new Container();
  c.addChild(new Text(`${theme.fg("toolTitle", theme.bold("history "))}${theme.fg("accent", item.label)}`, 0, 0));
  c.addChild(new Text(theme.fg("muted", new Date(item.timestamp).toLocaleString()), 0, 0));
  c.addChild(new Spacer(1));
  c.addChild(new Text(`cwd: ${item.cwd}`, 0, 0));
  c.addChild(new Text(`summary: ${item.summary}`, 0, 0));
  c.addChild(new Spacer(1));
  c.addChild(renderSubagentResult(item.result, { expanded: true }, theme));
  return c;
}

export function statusIcon(status: SubagentTaskResult["status"] | SubagentRunResult["status"]): string {
  switch (status) {
    case "completed": return "✓";
    case "failed": return "✗";
    case "aborted": return "◌";
    case "running":
    case "partial": return "⏳";
    default: return "•";
  }
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
