import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createCmuxTaskHandle } from "./cmux";
import { registerSubagentCommands } from "./commands";
import { buildInvalidModeMessage, buildInvalidModeResult, executeSubagentRun } from "./execution";
import { renderSubagentCall, renderSubagentResult } from "./render";
import { inferRequestedMode, SubagentParamsSchema, type SubagentParams } from "./schema";

export const promptSnippet = [
  "Delegate scoped work to a specialized subagent with isolated context.",
  'Use agent: "explore" or "scout" for read-only investigation.',
  'Use agent: "planner" for implementation planning.',
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
  registerSubagentCommands(pi);

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: "Delegate work to configured subagents loaded from defaults, user agents, and project agents.",
    promptSnippet,
    promptGuidelines,
    parameters: SubagentParamsSchema,

    renderCall(args, theme) {
      return renderSubagentCall(args as SubagentParams, theme);
    },

    renderResult(result, options, theme) {
      const details = result.details as any;
      return renderSubagentResult(details, options, theme);
    },

    async execute(_toolCallId, rawParams, signal, onUpdate, ctx) {
      const params = rawParams as SubagentParams;
      const inferredMode = inferRequestedMode(params);
      const taskHandle = await createCmuxTaskHandle("subagent");

      if (inferredMode === "invalid") {
        return {
          content: [{ type: "text", text: buildInvalidModeMessage(params) }],
          details: buildInvalidModeResult(params),
        };
      }

      try {
        const { summary, result } = await executeSubagentRun(params, ctx.cwd, signal, onUpdate, taskHandle);
        return {
          content: [{ type: "text", text: summary }],
          details: result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown subagent error.";
        await taskHandle.finish(false, `Subagent failed: ${message}`);
        return {
          content: [{ type: "text", text: `Subagent failed: ${message}` }],
          details: buildInvalidModeResult({ ...params, agent: params.agent ?? "unknown", task: params.task ?? "" }),
        };
      }
    },
  });
}
