import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";

import { createAgentMap, discoverAgents, type LoadedAgentDefinition } from "./agents";
import { mapWithConcurrencyLimit, runSingleSubagent } from "./runner";
import {
  inferRequestedMode,
  SubagentParamsSchema,
  type ChainTaskItem,
  type ParallelTaskItem,
  type ResultStatus,
  type SubagentParams,
  type SubagentRunResult,
  type SubagentTaskResult,
} from "./schema";

const MAX_CONCURRENCY = 4;

export const promptSnippet = [
  "Delegate scoped work to a specialized subagent with isolated context.",
  'Use agent: "explore" for read-only investigation.',
  'Use agent: "worker" for implementation.',
  'Use agent: "reviewer" for review and follow-up analysis.',
].join(" ");

export const promptGuidelines = [
  "Use this tool for broad exploration or isolated implementation tasks.",
  "Prefer single mode unless tasks are clearly independent or sequential.",
  "Do not delegate trivial one-file reads.",
  "Use known agent names only.",
];

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: "Delegate work to configured subagents loaded from defaults, user agents, and project agents.",
    promptSnippet,
    promptGuidelines,
    parameters: SubagentParamsSchema,

    renderCall(args, theme) {
      const mode = inferRequestedMode(args as SubagentParams);
      if (mode === "single") {
        const text = `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", args.agent || "unknown")}\n  ${theme.fg("dim", truncate(args.task || "", 80))}`;
        return new Text(text, 0, 0);
      }
      if (mode === "parallel") {
        const tasks = (args.tasks || []) as ParallelTaskItem[];
        let text = `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", `parallel (${tasks.length})`)}`;
        for (const task of tasks.slice(0, 3)) {
          text += `\n  ${theme.fg("accent", task.agent)} ${theme.fg("dim", truncate(task.task, 50))}`;
        }
        return new Text(text, 0, 0);
      }
      const chain = (args.chain || []) as ChainTaskItem[];
      let text = `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", `chain (${chain.length})`)}`;
      for (const task of chain.slice(0, 3)) {
        text += `\n  ${theme.fg("accent", task.agent)} ${theme.fg("dim", truncate(task.task, 50))}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, options, theme) {
      const details = result.details as SubagentRunResult | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
      }

      const container = new Container();
      const completed = details.results.filter((item) => item.status === "completed").length;
      const failed = details.results.filter((item) => item.status === "failed").length;
      const running = details.results.filter((item) => item.status === "running").length;
      const header = `${statusIcon(details.status)} ${theme.fg("toolTitle", theme.bold(`subagent ${details.mode}`))} ${theme.fg("muted", `(${completed}/${details.results.length} completed${failed ? `, ${failed} failed` : ""}${running ? `, ${running} running` : ""})`)}`;
      container.addChild(new Text(header, 0, 0));
      container.addChild(new Spacer(1));

      for (const item of details.results) {
        const line = `${statusIcon(item.status)} ${theme.fg("accent", item.agent)}${item.step ? theme.fg("muted", ` [step ${item.step}]`) : ""} ${theme.fg("dim", truncate(item.task, options.expanded ? 200 : 80))}`;
        container.addChild(new Text(line, 0, 0));
        if (item.errorMessage) {
          container.addChild(new Text(theme.fg("error", `  ${item.errorMessage}`), 0, 0));
        } else if (item.finalOutput) {
          container.addChild(new Text(theme.fg("muted", `  ${truncate(item.finalOutput, options.expanded ? 300 : 120)}`), 0, 0));
        }

        if (options.expanded && item.transcript?.length) {
          const transcriptLines = item.transcript.slice(-6).map((entry) => {
            if (entry.toolName && entry.role === "assistant") {
              return `  → ${entry.toolName}${entry.text ? `: ${truncate(entry.text, 80)}` : ""}`;
            }
            return `  · ${truncate(entry.text || "", 100)}`;
          });
          for (const transcriptLine of transcriptLines) {
            container.addChild(new Text(theme.fg("dim", transcriptLine), 0, 0));
          }
        }

        if (item.usage && options.expanded) {
          container.addChild(new Text(theme.fg("muted", `  usage ↑${item.usage.input} ↓${item.usage.output}${item.usage.cost ? ` $${item.usage.cost.toFixed(4)}` : ""}`), 0, 0));
        }

        container.addChild(new Spacer(1));
      }

      return container;
    },

    async execute(_toolCallId, rawParams, signal, onUpdate, ctx) {
      const params = rawParams as SubagentParams;
      const agents = await discoverAgents(ctx.cwd);
      const agentMap = createAgentMap(agents);
      const inferredMode = inferRequestedMode(params);

      if (inferredMode === "invalid") {
        return {
          content: [{ type: "text", text: buildInvalidModeMessage(params) }],
          details: buildInvalidModeResult(params),
        };
      }

      try {
        validateDeclaredMode(params, inferredMode);

        let result: SubagentRunResult;
        switch (inferredMode) {
          case "single":
            result = await runSingle(params, agentMap, ctx.cwd, signal, onUpdate);
            break;
          case "parallel":
            result = await runParallel(params, agentMap, ctx.cwd, signal, onUpdate);
            break;
          case "chain":
            result = await runChain(params, agentMap, ctx.cwd, signal, onUpdate);
            break;
        }

        return {
          content: [{ type: "text", text: summarizeRunResult(result) }],
          details: result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown subagent error.";
        const result: SubagentRunResult = {
          mode: inferredMode,
          status: "failed",
          results: [
            {
              agent: params.agent ?? "unknown",
              task: params.task ?? "",
              taskId: params.taskId,
              status: "failed",
              errorMessage: message,
            },
          ],
        };

        return {
          content: [{ type: "text", text: `Subagent failed: ${message}` }],
          details: result,
        };
      }
    },
  });
}

function buildInvalidModeMessage(params: SubagentParams): string {
  return (
    "Invalid subagent mode selection. Provide exactly one of: single (agent + task), parallel (tasks), or chain (chain)." +
    (params.mode ? ` Received mode: ${params.mode}.` : "")
  );
}

function buildInvalidModeResult(params: SubagentParams): SubagentRunResult {
  return {
    mode: "single",
    status: "failed",
    results: [
      {
        agent: params.agent ?? "unknown",
        task: params.task ?? "",
        taskId: params.taskId,
        status: "failed",
        errorMessage: buildInvalidModeMessage(params),
      },
    ],
  };
}

function validateDeclaredMode(params: SubagentParams, inferredMode: "single" | "parallel" | "chain") {
  if (params.mode && params.mode !== inferredMode) {
    throw new Error(`Requested mode "${params.mode}" does not match provided parameters, which resolve to "${inferredMode}".`);
  }
}

function requireAgent(agentName: string, agentMap: Map<string, LoadedAgentDefinition>): LoadedAgentDefinition {
  const agent = agentMap.get(agentName);
  if (!agent) {
    const knownAgents = [...agentMap.keys()].sort().join(", ");
    throw new Error(`Unknown subagent "${agentName}". Known agents: ${knownAgents || "none"}.`);
  }
  return agent;
}

function buildTaskResult(
  item: { agent: string; task: string; taskId?: string },
  status: ResultStatus,
  extra: Partial<SubagentTaskResult> = {},
): SubagentTaskResult {
  return {
    agent: item.agent,
    task: item.task,
    taskId: item.taskId,
    status,
    ...extra,
  };
}

async function runSingle(
  params: SubagentParams,
  agentMap: Map<string, LoadedAgentDefinition>,
  cwd: string,
  signal?: AbortSignal,
  onUpdate?: (partial: { content?: Array<{ type: "text"; text: string }>; details?: SubagentRunResult }) => void,
): Promise<SubagentRunResult> {
  if (!params.agent || !params.task) {
    throw new Error('Single mode requires both "agent" and "task".');
  }

  const loaded = requireAgent(params.agent, agentMap);
  const agent = loaded.definition;

  if (params.allowWrite && !agent.allowWrite) {
    throw new Error(`Agent "${agent.name}" does not allow write access.`);
  }

  if (params.allowBash && !agent.allowBash) {
    throw new Error(`Agent "${agent.name}" does not allow bash access.`);
  }

  onUpdate?.({
    content: [{ type: "text", text: `Running ${agent.name}...` }],
    details: {
      mode: "single",
      status: "partial",
      results: [
        buildTaskResult(
          { agent: agent.name, task: params.task, taskId: params.taskId },
          "running",
        ),
      ],
    },
  });

  const run = await runSingleSubagent({
    agent,
    task: params.task,
    cwd: params.cwd ?? cwd,
    signal,
    allowWrite: params.allowWrite ?? agent.allowWrite,
    allowBash: params.allowBash ?? agent.allowBash,
  });

  return {
    mode: "single",
    status: run.status === "aborted" ? "aborted" : run.status === "completed" ? "completed" : "failed",
    results: [
      buildTaskResult(
        { agent: agent.name, task: params.task, taskId: params.taskId },
        run.status,
        {
          stopReason: run.stopReason,
          errorMessage: run.errorMessage,
          exitCode: run.exitCode,
          finalOutput: run.finalOutput,
          usage: run.usage,
          transcript: run.transcript.map((entry) => ({
            role: entry.role,
            text: entry.text,
            toolName: entry.toolName,
          })),
        },
      ),
    ],
  };
}

async function runParallel(
  params: SubagentParams,
  agentMap: Map<string, LoadedAgentDefinition>,
  cwd: string,
  signal?: AbortSignal,
  onUpdate?: (partial: { content?: Array<{ type: "text"; text: string }>; details?: SubagentRunResult }) => void,
): Promise<SubagentRunResult> {
  const tasks = validateParallel(params.tasks ?? [], agentMap);
  const concurrency = Math.min(params.maxConcurrency ?? MAX_CONCURRENCY, MAX_CONCURRENCY);

  const liveResults: SubagentTaskResult[] = tasks.map((task) =>
    buildTaskResult({ agent: task.agent, task: task.task, taskId: task.taskId }, "running"),
  );

  onUpdate?.({
    content: [{ type: "text", text: `Parallel subagents running: 0/${tasks.length} finished` }],
    details: {
      mode: "parallel",
      status: "partial",
      results: liveResults,
    },
  });

  const results = await mapWithConcurrencyLimit(tasks, concurrency, async (task, index) => {
    const loaded = requireAgent(task.agent, agentMap);
    const run = await runSingleSubagent({
      agent: loaded.definition,
      task: task.task,
      cwd: task.cwd ?? cwd,
      signal,
      allowWrite: loaded.definition.allowWrite,
      allowBash: loaded.definition.allowBash,
    });

    const result = buildTaskResult(
      { agent: task.agent, task: task.task, taskId: task.taskId },
      run.status,
      {
        stopReason: run.stopReason,
        errorMessage: run.errorMessage,
        exitCode: run.exitCode,
        finalOutput: run.finalOutput,
        usage: run.usage,
        transcript: run.transcript.map((entry) => ({
          role: entry.role,
          text: entry.text,
          toolName: entry.toolName,
        })),
      },
    );

    liveResults[index] = result;
    const finished = liveResults.filter((item) => item.status !== "running").length;
    onUpdate?.({
      content: [{ type: "text", text: `Parallel subagents running: ${finished}/${tasks.length} finished` }],
      details: {
        mode: "parallel",
        status: aggregateRunStatus(liveResults),
        results: [...liveResults],
      },
    });

    return result;
  });

  return {
    mode: "parallel",
    status: aggregateRunStatus(results),
    results,
  };
}

async function runChain(
  params: SubagentParams,
  agentMap: Map<string, LoadedAgentDefinition>,
  cwd: string,
  signal?: AbortSignal,
  onUpdate?: (partial: { content?: Array<{ type: "text"; text: string }>; details?: SubagentRunResult }) => void,
): Promise<SubagentRunResult> {
  const chain = validateChain(params.chain ?? [], agentMap);
  const results: SubagentTaskResult[] = [];
  let previous = "";

  for (let index = 0; index < chain.length; index += 1) {
    const item = chain[index];
    const loaded = requireAgent(item.agent, agentMap);
    const task = item.task.replace(/\{previous\}/g, previous);

    onUpdate?.({
      content: [{ type: "text", text: `Chain step ${index + 1}/${chain.length}: ${item.agent}` }],
      details: {
        mode: "chain",
        status: "partial",
        results: [
          ...results,
          buildTaskResult({ agent: item.agent, task, taskId: item.taskId }, "running", { step: index + 1 }),
        ],
      },
    });

    const run = await runSingleSubagent({
      agent: loaded.definition,
      task,
      cwd: item.cwd ?? cwd,
      signal,
      allowWrite: loaded.definition.allowWrite,
      allowBash: loaded.definition.allowBash,
    });

    const result = buildTaskResult(
      { agent: item.agent, task, taskId: item.taskId },
      run.status,
      {
        step: index + 1,
        stopReason: run.stopReason,
        errorMessage: run.errorMessage,
        exitCode: run.exitCode,
        finalOutput: run.finalOutput,
        usage: run.usage,
        transcript: run.transcript.map((entry) => ({
          role: entry.role,
          text: entry.text,
          toolName: entry.toolName,
        })),
      },
    );
    results.push(result);

    if (run.status !== "completed") {
      return {
        mode: "chain",
        status: aggregateRunStatus(results),
        results,
      };
    }

    previous = run.finalOutput ?? "";
  }

  return {
    mode: "chain",
    status: aggregateRunStatus(results),
    results,
  };
}

function validateParallel(tasks: ParallelTaskItem[], agentMap: Map<string, LoadedAgentDefinition>) {
  return tasks.map((task, index) => {
    if (!task.agent || !task.task) {
      throw new Error(`Parallel task at index ${index} must include both "agent" and "task".`);
    }
    requireAgent(task.agent, agentMap);
    return task;
  });
}

function validateChain(chain: ChainTaskItem[], agentMap: Map<string, LoadedAgentDefinition>) {
  return chain.map((task, index) => {
    if (!task.agent || !task.task) {
      throw new Error(`Chain task at index ${index} must include both "agent" and "task".`);
    }
    requireAgent(task.agent, agentMap);
    return task;
  });
}

function aggregateRunStatus(results: SubagentTaskResult[]): SubagentRunResult["status"] {
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.some((result) => result.status === "aborted")) return "aborted";
  if (results.every((result) => result.status === "completed")) return "completed";
  return "partial";
}

function summarizeRunResult(result: SubagentRunResult): string {
  if (result.results.length === 0) return "No subagent work was performed.";

  if (result.mode === "single") {
    const item = result.results[0];
    if (item.status === "completed") return item.finalOutput || `Subagent ${item.agent} completed.`;
    return item.errorMessage || `Subagent ${item.agent} failed.`;
  }

  const completed = result.results.filter((item) => item.status === "completed").length;
  const failures = result.results.filter((item) => item.status === "failed").length;
  return `${result.mode} subagent run complete: ${completed}/${result.results.length} completed${failures ? `, ${failures} failed` : ""}.`;
}

function statusIcon(status: SubagentTaskResult["status"] | SubagentRunResult["status"]): string {
  switch (status) {
    case "completed":
      return "✓";
    case "failed":
      return "✗";
    case "aborted":
      return "◌";
    case "running":
    case "partial":
      return "⏳";
    default:
      return "•";
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
