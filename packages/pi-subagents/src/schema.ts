import { StringEnum } from "@mariozechner/pi-ai";
import { Type, type Static } from "@sinclair/typebox";

/**
 * Core agent model
 */
export const AgentModeSchema = StringEnum(["primary", "subagent", "all"] as const, {
  description: "Where this agent is allowed to participate.",
});
export type AgentMode = Static<typeof AgentModeSchema>;

export const ContextModeSchema = StringEnum(["fresh", "resume", "fork"] as const, {
  description: "How the subagent context should be initialized.",
});
export type ContextMode = Static<typeof ContextModeSchema>;

export const AgentSourceSchema = StringEnum(["user", "project", "extension", "unknown"] as const, {
  description: "Where an agent definition came from.",
});
export type AgentSource = Static<typeof AgentSourceSchema>;

export const ToolPolicyTypeSchema = StringEnum(["inherit", "fixed", "readOnly"] as const);
export type ToolPolicyType = Static<typeof ToolPolicyTypeSchema>;

export const DelegatePolicyTypeSchema = StringEnum(["none", "allowlist", "pattern"] as const);
export type DelegatePolicyType = Static<typeof DelegatePolicyTypeSchema>;

export const ToolPolicySchema = Type.Union([
  Type.Object({
    type: Type.Literal("inherit"),
  }),
  Type.Object({
    type: Type.Literal("fixed"),
    tools: Type.Array(Type.String(), {
      description: "Explicit tool allowlist for this agent.",
      default: ["read", "grep", "find", "ls"],
    }),
  }),
  Type.Object({
    type: Type.Literal("readOnly"),
  }),
]);
export type ToolPolicy = Static<typeof ToolPolicySchema>;

export const DelegatePolicySchema = Type.Union([
  Type.Object({
    type: Type.Literal("none"),
  }),
  Type.Object({
    type: Type.Literal("allowlist"),
    agents: Type.Array(Type.String(), {
      description: "Names of agents this agent may delegate to.",
      default: [],
    }),
  }),
  Type.Object({
    type: Type.Literal("pattern"),
    patterns: Type.Array(Type.String(), {
      description: "Glob-like patterns for agent delegation.",
      default: [],
    }),
  }),
]);
export type DelegatePolicy = Static<typeof DelegatePolicySchema>;

export const SubagentDefinitionSchema = Type.Object({
  name: Type.String({ description: "Unique agent name." }),
  description: Type.String({ description: "Short user-facing description." }),
  mode: Type.Optional(AgentModeSchema),
  hidden: Type.Optional(Type.Boolean({ default: false })),

  model: Type.Optional(Type.String({ description: "Pi model selector, e.g. sonnet, haiku, openai/gpt-4.1" })),
  systemPrompt: Type.String({ description: "System prompt used when this agent runs." }),

  tools: Type.Optional(ToolPolicySchema),
  maxSteps: Type.Optional(Type.Number({ minimum: 1, default: 8 })),
  contextMode: Type.Optional(ContextModeSchema),

  delegatePolicy: Type.Optional(DelegatePolicySchema),
  allowWrite: Type.Optional(Type.Boolean({ default: false })),
  allowBash: Type.Optional(Type.Boolean({ default: false })),

  tags: Type.Optional(Type.Array(Type.String(), { default: [] })),
  source: Type.Optional(AgentSourceSchema),
});
export type SubagentDefinition = Static<typeof SubagentDefinitionSchema>;

/**
 * Persisted task/session bookkeeping
 */
export const TaskStatusSchema = StringEnum(["running", "completed", "failed", "aborted"] as const);
export type TaskStatus = Static<typeof TaskStatusSchema>;

export const SubagentTaskRecordSchema = Type.Object({
  taskId: Type.String({ description: "Stable task identifier." }),
  agent: Type.String(),
  sessionRef: Type.Optional(Type.String({ description: "Underlying subagent session file/id if available." })),
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
  status: TaskStatusSchema,
  cwd: Type.String(),
  parentLeafId: Type.Optional(Type.String()),
});
export type SubagentTaskRecord = Static<typeof SubagentTaskRecordSchema>;

/**
 * Tool parameter schemas
 */
export const SingleModeSchema = Type.Object({
  mode: Type.Optional(Type.Literal("single")),
  agent: Type.String({ description: "Subagent name for single mode." }),
  task: Type.String({ description: "Task for the subagent." }),

  cwd: Type.Optional(Type.String({ description: "Working directory override." })),
  contextMode: Type.Optional(ContextModeSchema),

  taskId: Type.Optional(Type.String({ description: "Optional caller-assigned task id." })),
  resumeTaskId: Type.Optional(Type.String({ description: "Resume a previous subagent task." })),

  allowWrite: Type.Optional(Type.Boolean({
    description: "Request write access if the selected agent allows it.",
  })),
  allowBash: Type.Optional(Type.Boolean({
    description: "Request bash access if the selected agent allows it.",
  })),
});
export type SingleModeParams = Static<typeof SingleModeSchema>;

export const ParallelTaskItemSchema = Type.Object({
  agent: Type.String({ description: "Subagent name." }),
  task: Type.String({ description: "Task for that subagent." }),
  cwd: Type.Optional(Type.String({ description: "Working directory override." })),
  taskId: Type.Optional(Type.String({ description: "Optional stable task identifier." })),
});
export type ParallelTaskItem = Static<typeof ParallelTaskItemSchema>;

export const ParallelModeSchema = Type.Object({
  mode: Type.Literal("parallel"),
  tasks: Type.Array(ParallelTaskItemSchema, {
    description: "Independent tasks to run in parallel.",
    minItems: 1,
    maxItems: 8,
  }),
  contextMode: Type.Optional(StringEnum(["fresh", "resume"] as const, {
    description: "Parallel runs should default to fresh or resume only.",
  })),
  maxConcurrency: Type.Optional(Type.Number({
    description: "Concurrency cap. Extension should hard-cap this at runtime.",
    minimum: 1,
    maximum: 4,
    default: 4,
  })),
});
export type ParallelModeParams = Static<typeof ParallelModeSchema>;

export const ChainTaskItemSchema = Type.Object({
  agent: Type.String({ description: "Subagent name." }),
  task: Type.String({
    description: "Task for that subagent. May include the {previous} placeholder.",
  }),
  cwd: Type.Optional(Type.String({ description: "Working directory override." })),
  taskId: Type.Optional(Type.String({ description: "Optional stable task identifier." })),
});
export type ChainTaskItem = Static<typeof ChainTaskItemSchema>;

export const ChainModeSchema = Type.Object({
  mode: Type.Literal("chain"),
  chain: Type.Array(ChainTaskItemSchema, {
    description: "Sequential tasks where later prompts may use {previous}.",
    minItems: 1,
    maxItems: 8,
  }),
  contextMode: Type.Optional(StringEnum(["fresh", "resume"] as const, {
    description: "Chain runs should default to fresh or resume only.",
  })),
});
export type ChainModeParams = Static<typeof ChainModeSchema>;

/**
 * Broad tool schema for registration in Pi.
 *
 * Note: Pi tools typically use a single object schema, so v1 runtime validation
 * should still enforce the 'exactly one mode' rule explicitly.
 */
export const SubagentParamsSchema = Type.Object({
  mode: Type.Optional(StringEnum(["single", "parallel", "chain"] as const)),

  agent: Type.Optional(Type.String({ description: "Subagent name for single mode." })),
  task: Type.Optional(Type.String({ description: "Task for single mode." })),

  tasks: Type.Optional(Type.Array(ParallelTaskItemSchema, {
    description: "Parallel task list.",
    minItems: 1,
    maxItems: 8,
  })),

  chain: Type.Optional(Type.Array(ChainTaskItemSchema, {
    description: "Sequential chain task list.",
    minItems: 1,
    maxItems: 8,
  })),

  cwd: Type.Optional(Type.String({ description: "Working directory override for single mode." })),
  contextMode: Type.Optional(ContextModeSchema),

  taskId: Type.Optional(Type.String({ description: "Optional stable task id for single mode." })),
  resumeTaskId: Type.Optional(Type.String({ description: "Resume a previous subagent task in single mode." })),

  allowWrite: Type.Optional(Type.Boolean({
    description: "Request write access if the selected agent allows it.",
  })),
  allowBash: Type.Optional(Type.Boolean({
    description: "Request bash access if the selected agent allows it.",
  })),

  maxConcurrency: Type.Optional(Type.Number({
    description: "Parallel concurrency cap.",
    minimum: 1,
    maximum: 4,
  })),
});
export type SubagentParams = Static<typeof SubagentParamsSchema>;

/**
 * Tool result details
 */
export const ResultStatusSchema = StringEnum(["running", "completed", "failed", "aborted"] as const);
export type ResultStatus = Static<typeof ResultStatusSchema>;

export const UsageStatsSchema = Type.Object({
  input: Type.Number({ default: 0 }),
  output: Type.Number({ default: 0 }),
  cacheRead: Type.Number({ default: 0 }),
  cacheWrite: Type.Number({ default: 0 }),
  cost: Type.Number({ default: 0 }),
  contextTokens: Type.Optional(Type.Number()),
  turns: Type.Optional(Type.Number()),
});
export type UsageStats = Static<typeof UsageStatsSchema>;

export const TranscriptEntrySchema = Type.Object({
  role: StringEnum(["assistant", "toolResult"] as const),
  text: Type.Optional(Type.String()),
  toolName: Type.Optional(Type.String()),
});
export type TranscriptEntry = Static<typeof TranscriptEntrySchema>;

export const SubagentTaskResultSchema = Type.Object({
  agent: Type.String(),
  task: Type.String(),
  taskId: Type.Optional(Type.String()),
  sessionRef: Type.Optional(Type.String()),
  step: Type.Optional(Type.Number()),

  status: ResultStatusSchema,
  exitCode: Type.Optional(Type.Number()),
  stopReason: Type.Optional(Type.String()),
  errorMessage: Type.Optional(Type.String()),

  usage: Type.Optional(UsageStatsSchema),
  finalOutput: Type.Optional(Type.String()),
  transcript: Type.Optional(Type.Array(TranscriptEntrySchema)),
});
export type SubagentTaskResult = Static<typeof SubagentTaskResultSchema>;

export const SubagentRunResultSchema = Type.Object({
  mode: StringEnum(["single", "parallel", "chain"] as const),
  status: StringEnum(["completed", "partial", "failed", "aborted"] as const),
  results: Type.Array(SubagentTaskResultSchema),
});
export type SubagentRunResult = Static<typeof SubagentRunResultSchema>;

/**
 * Safe defaults
 */
export const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;
export const DEFAULT_WORKER_TOOLS = ["read", "grep", "find", "ls", "edit", "write", "bash"] as const;

export const DEFAULT_EXPLORE_AGENT: SubagentDefinition = {
  name: "explore",
  description: "Read-only codebase reconnaissance and summarization",
  mode: "subagent",
  hidden: false,
  model: "haiku",
  systemPrompt: "Explore the codebase, summarize findings, and do not edit files.",
  tools: { type: "fixed", tools: [...READ_ONLY_TOOLS] },
  maxSteps: 6,
  contextMode: "fresh",
  delegatePolicy: { type: "none" },
  allowWrite: false,
  allowBash: false,
  tags: ["read-only", "recon"],
  source: "extension",
};

export const DEFAULT_WORKER_AGENT: SubagentDefinition = {
  name: "worker",
  description: "General implementation agent for scoped coding tasks",
  mode: "subagent",
  hidden: false,
  model: "sonnet",
  systemPrompt: "Execute a scoped implementation task autonomously and report concise results.",
  tools: { type: "fixed", tools: [...DEFAULT_WORKER_TOOLS] },
  maxSteps: 12,
  contextMode: "fresh",
  delegatePolicy: { type: "none" },
  allowWrite: true,
  allowBash: true,
  tags: ["implementation"],
  source: "extension",
};

export const DEFAULT_REVIEWER_AGENT: SubagentDefinition = {
  name: "reviewer",
  description: "Review code changes for correctness, risk, and follow-ups",
  mode: "subagent",
  hidden: false,
  model: "sonnet",
  systemPrompt: "Review changes, identify issues and follow-ups, and avoid editing files unless explicitly asked.",
  tools: { type: "fixed", tools: ["read", "grep", "find", "ls", "bash"] },
  maxSteps: 8,
  contextMode: "fresh",
  delegatePolicy: { type: "none" },
  allowWrite: false,
  allowBash: true,
  tags: ["review"],
  source: "extension",
};

export const DEFAULT_SUBAGENTS: SubagentDefinition[] = [
  DEFAULT_EXPLORE_AGENT,
  DEFAULT_WORKER_AGENT,
  DEFAULT_REVIEWER_AGENT,
];

/**
 * Runtime helpers
 */
export function inferRequestedMode(params: SubagentParams): "single" | "parallel" | "chain" | "invalid" {
  const hasSingle = Boolean(params.agent && params.task);
  const hasParallel = Boolean(params.tasks?.length);
  const hasChain = Boolean(params.chain?.length);
  const count = Number(hasSingle) + Number(hasParallel) + Number(hasChain);

  if (count !== 1) return "invalid";
  if (hasParallel) return "parallel";
  if (hasChain) return "chain";
  return "single";
}

export function resolveToolList(def: SubagentDefinition): string[] | undefined {
  if (!def.tools) return undefined;
  if (def.tools.type === "inherit") return undefined;
  if (def.tools.type === "readOnly") return [...READ_ONLY_TOOLS];
  return [...def.tools.tools];
}

export function canDelegateTo(def: SubagentDefinition, candidate: string): boolean {
  const policy = def.delegatePolicy ?? { type: "none" as const };
  if (policy.type === "none") return false;
  if (policy.type === "allowlist") return policy.agents.includes(candidate);
  if (policy.type === "pattern") {
    return policy.patterns.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern.endsWith("*")) return candidate.startsWith(pattern.slice(0, -1));
      return candidate === pattern;
    });
  }
  return false;
}
