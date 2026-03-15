import type { ExtensionAPI, SlashCommandHandlerContext } from "@mariozechner/pi-coding-agent";

import type { SubagentParams, SubagentRunResult } from "./schema";

const HISTORY_ENTRY_TYPE = "subagent-run-history";

export interface HistoryEntryData {
  timestamp: number;
  label: string;
  cwd: string;
  params: SubagentParams;
  summary: string;
  result: SubagentRunResult;
}

export function appendRunHistory(
  pi: ExtensionAPI,
  data: HistoryEntryData,
) {
  pi.appendEntry(HISTORY_ENTRY_TYPE, data);
}

export function getRunHistory(ctx: SlashCommandHandlerContext): HistoryEntryData[] {
  const entries = ctx.sessionManager.getEntries();
  const results: HistoryEntryData[] = [];
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === HISTORY_ENTRY_TYPE && entry.data) {
      results.push(entry.data as HistoryEntryData);
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp);
}

export function formatHistoryLabel(item: HistoryEntryData): string {
  const when = new Date(item.timestamp).toLocaleTimeString();
  return `${when} — ${item.label} — ${item.summary}`;
}
