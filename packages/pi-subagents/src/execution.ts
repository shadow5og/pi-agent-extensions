import { createAgentMap, discoverAgents, type LoadedAgentDefinition } from "./agents";
import type { CmuxTaskHandle } from "./cmux";
import { mapWithConcurrencyLimit, runSingleSubagent } from "./runner";
import {
  inferRequestedMode,
  type ChainTaskItem,
  type ParallelTaskItem,
  type ResultStatus,
  type SubagentParams,
  type SubagentRunResult,
  type SubagentTaskResult,
} from "./schema";

const MAX_CONCURRENCY = 4;

export async function executeSubagentRun(
  params: SubagentParams,
  cwd: string,
  signal?: AbortSignal,
  onUpdate?: (partial: { content?: Array<{ type: "text"; text: string }>; details?: SubagentRunResult }) => void,
  taskHandle?: CmuxTaskHandle,
): Promise<{ summary: string; result: SubagentRunResult }> {
  const agents = await discoverAgents(cwd);
  const agentMap = createAgentMap(agents);
  const inferredMode = inferRequestedMode(params);

  if (inferredMode === "invalid") {
    const result = buildInvalidModeResult(params);
    return { summary: buildInvalidModeMessage(params), result };
  }

  validateDeclaredMode(params, inferredMode);
  const itemCount = inferredMode === "single" ? 1 : inferredMode === "parallel" ? (params.tasks?.length ?? 0) : (params.chain?.length ?? 0);
  await taskHandle?.started(inferredMode, itemCount);

  let result: SubagentRunResult;
  switch (inferredMode) {
    case "single":
      result = await runSingle(params, agentMap, cwd, signal, onUpdate, taskHandle);
      break;
    case "parallel":
      result = await runParallel(params, agentMap, cwd, signal, onUpdate, taskHandle);
      break;
    case "chain":
      result = await runChain(params, agentMap, cwd, signal, onUpdate, taskHandle);
      break;
  }

  const summary = summarizeRunResult(result);
  await taskHandle?.finish(result.status === "completed", summary);
  return { summary, result };
}

export function buildInvalidModeMessage(params: SubagentParams): string {
  return (
    "Invalid subagent mode selection. Provide exactly one of: single (agent + task), parallel (tasks), or chain (chain)." +
    (params.mode ? ` Received mode: ${params.mode}.` : "")
  );
}

export function buildInvalidModeResult(params: SubagentParams): SubagentRunResult {
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

export function validateDeclaredMode(params: SubagentParams, inferredMode: "single" | "parallel" | "chain") {
  if (params.mode && params.mode !== inferredMode) {
    throw new Error(`Requested mode \"${params.mode}\" does not match provided parameters, which resolve to \"${inferredMode}\".`);
  }
}

export function requireAgent(agentName: string, agentMap: Map<string, LoadedAgentDefinition>): LoadedAgentDefinition {
  const agent = agentMap.get(agentName);
  if (!agent) {
    const knownAgents = [...agentMap.keys()].sort().join(", ");
    throw new Error(`Unknown subagent \"${agentName}\". Known agents: ${knownAgents || "none"}.`);
  }
  return agent;
}

export function buildTaskResult(
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
  taskHandle?: CmuxTaskHandle,
): Promise<SubagentRunResult> {
  if (!params.agent || !params.task) {
    throw new Error('Single mode requires both "agent" and "task".');
  }

  const loaded = requireAgent(params.agent, agentMap);
  const agent = loaded.definition;

  if (params.allowWrite && !agent.allowWrite) throw new Error(`Agent \"${agent.name}\" does not allow write access.`);
  if (params.allowBash && !agent.allowBash) throw new Error(`Agent \"${agent.name}\" does not allow bash access.`);

  await taskHandle?.update(0.15, `Running ${agent.name}`);
  await taskHandle?.milestone(`Running single subagent ${agent.name}`);

  onUpdate?.({
    content: [{ type: "text", text: `Running ${agent.name}...` }],
    details: {
      mode: "single",
      status: "partial",
      results: [buildTaskResult({ agent: agent.name, task: params.task, taskId: params.taskId }, "running")],
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

  await taskHandle?.update(0.9, run.status === "completed" ? `Completed ${agent.name}` : `Finished ${agent.name}`);

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
          transcript: run.transcript.map((entry) => ({ role: entry.role, text: entry.text, toolName: entry.toolName })),
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
  taskHandle?: CmuxTaskHandle,
): Promise<SubagentRunResult> {
  const tasks = validateParallel(params.tasks ?? [], agentMap);
  const concurrency = Math.min(params.maxConcurrency ?? MAX_CONCURRENCY, MAX_CONCURRENCY);
  const liveResults: SubagentTaskResult[] = tasks.map((task) => buildTaskResult({ agent: task.agent, task: task.task, taskId: task.taskId }, "running"));

  await taskHandle?.update(0.12, `Parallel run starting (${tasks.length})`);
  await taskHandle?.milestone(`Starting parallel subagents with concurrency ${concurrency}`);

  onUpdate?.({
    content: [{ type: "text", text: `Parallel subagents running: 0/${tasks.length} finished` }],
    details: { mode: "parallel", status: "partial", results: liveResults },
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
        transcript: run.transcript.map((entry) => ({ role: entry.role, text: entry.text, toolName: entry.toolName })),
      },
    );

    liveResults[index] = result;
    const finished = liveResults.filter((item) => item.status !== "running").length;
    await taskHandle?.update(0.15 + (finished / tasks.length) * 0.75, `Parallel progress ${finished}/${tasks.length}`);
    await taskHandle?.milestone(`Parallel subagent finished: ${task.agent} (${finished}/${tasks.length})`);
    onUpdate?.({
      content: [{ type: "text", text: `Parallel subagents running: ${finished}/${tasks.length} finished` }],
      details: { mode: "parallel", status: aggregateRunStatus(liveResults), results: [...liveResults] },
    });

    return result;
  });

  return { mode: "parallel", status: aggregateRunStatus(results), results };
}

async function runChain(
  params: SubagentParams,
  agentMap: Map<string, LoadedAgentDefinition>,
  cwd: string,
  signal?: AbortSignal,
  onUpdate?: (partial: { content?: Array<{ type: "text"; text: string }>; details?: SubagentRunResult }) => void,
  taskHandle?: CmuxTaskHandle,
): Promise<SubagentRunResult> {
  const chain = validateChain(params.chain ?? [], agentMap);
  const results: SubagentTaskResult[] = [];
  let previous = "";

  await taskHandle?.update(0.12, `Chain starting (${chain.length})`);
  await taskHandle?.milestone(`Starting chain subagents (${chain.length} steps)`);

  for (let index = 0; index < chain.length; index += 1) {
    const item = chain[index];
    const loaded = requireAgent(item.agent, agentMap);
    const task = item.task.replace(/\{previous\}/g, previous);

    await taskHandle?.update(0.15 + (index / chain.length) * 0.7, `Chain step ${index + 1}/${chain.length}: ${item.agent}`);
    await taskHandle?.milestone(`Running chain step ${index + 1}/${chain.length}: ${item.agent}`);

    onUpdate?.({
      content: [{ type: "text", text: `Chain step ${index + 1}/${chain.length}: ${item.agent}` }],
      details: {
        mode: "chain",
        status: "partial",
        results: [...results, buildTaskResult({ agent: item.agent, task, taskId: item.taskId }, "running", { step: index + 1 })],
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
        transcript: run.transcript.map((entry) => ({ role: entry.role, text: entry.text, toolName: entry.toolName })),
      },
    );
    results.push(result);
    if (run.status !== "completed") return { mode: "chain", status: aggregateRunStatus(results), results };
    previous = run.finalOutput ?? "";
  }

  await taskHandle?.update(0.92, "Chain complete");
  return { mode: "chain", status: aggregateRunStatus(results), results };
}

function validateParallel(tasks: ParallelTaskItem[], agentMap: Map<string, LoadedAgentDefinition>) {
  return tasks.map((task, index) => {
    if (!task.agent || !task.task) throw new Error(`Parallel task at index ${index} must include both \"agent\" and \"task\".`);
    requireAgent(task.agent, agentMap);
    return task;
  });
}

function validateChain(chain: ChainTaskItem[], agentMap: Map<string, LoadedAgentDefinition>) {
  return chain.map((task, index) => {
    if (!task.agent || !task.task) throw new Error(`Chain task at index ${index} must include both \"agent\" and \"task\".`);
    requireAgent(task.agent, agentMap);
    return task;
  });
}

export function aggregateRunStatus(results: SubagentTaskResult[]): SubagentRunResult["status"] {
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.some((result) => result.status === "aborted")) return "aborted";
  if (results.every((result) => result.status === "completed")) return "completed";
  return "partial";
}

export function summarizeRunResult(result: SubagentRunResult): string {
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
