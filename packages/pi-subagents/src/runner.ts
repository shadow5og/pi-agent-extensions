import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveToolList, type SubagentDefinition, type UsageStats } from "./schema";

export interface SubagentTranscriptEntry {
  role: "assistant" | "toolResult";
  text?: string;
  toolName?: string;
  toolArgs?: unknown;
}

export interface RunSingleSubagentInput {
  agent: SubagentDefinition;
  task: string;
  cwd: string;
  signal?: AbortSignal;
  allowWrite?: boolean;
  allowBash?: boolean;
}

export interface RunSingleSubagentResult {
  exitCode: number;
  status: "completed" | "failed" | "aborted";
  stopReason?: string;
  errorMessage?: string;
  finalOutput?: string;
  usage: UsageStats;
  transcript: SubagentTranscriptEntry[];
}

export async function runSingleSubagent(input: RunSingleSubagentInput): Promise<RunSingleSubagentResult> {
  const { args, tempDir } = await buildPiArgs(input);
  const transcript: SubagentTranscriptEntry[] = [];
  const usage: UsageStats = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    turns: 0,
  };

  let finalOutput = "";
  let stopReason: string | undefined;
  let errorMessage: string | undefined;
  let aborted = false;

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn("pi", args, {
        cwd: input.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdoutBuffer = "";
      let stderrBuffer = "";
      let abortListener: (() => void) | undefined;

      const parseLine = (line: string) => {
        if (!line.trim()) return;

        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message?.role === "assistant") {
          const message = event.message;
          const textParts = Array.isArray(message.content)
            ? message.content.filter((part: any) => part.type === "text").map((part: any) => part.text)
            : [];
          const toolCalls = Array.isArray(message.content)
            ? message.content.filter((part: any) => part.type === "toolCall")
            : [];

          for (const text of textParts) {
            transcript.push({ role: "assistant", text });
            finalOutput = text;
          }

          for (const toolCall of toolCalls) {
            transcript.push({
              role: "assistant",
              toolName: toolCall.name,
              toolArgs: toolCall.arguments,
            });
          }

          const messageUsage = message.usage;
          if (messageUsage) {
            usage.input += messageUsage.input || 0;
            usage.output += messageUsage.output || 0;
            usage.cacheRead += messageUsage.cacheRead || 0;
            usage.cacheWrite += messageUsage.cacheWrite || 0;
            usage.cost += messageUsage.cost?.total || 0;
            usage.contextTokens = messageUsage.totalTokens || usage.contextTokens;
          }
          usage.turns = (usage.turns || 0) + 1;
          stopReason = message.stopReason || stopReason;
          errorMessage = message.errorMessage || errorMessage;
        }

        if (event.type === "tool_result_end" && event.message) {
          const message = event.message;
          const textParts = Array.isArray(message.content)
            ? message.content.filter((part: any) => part.type === "text").map((part: any) => part.text)
            : [];

          for (const text of textParts) {
            transcript.push({
              role: "toolResult",
              text,
              toolName: message.toolName,
            });
          }
        }
      };

      proc.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) parseLine(line);
      });

      proc.stderr.on("data", (chunk) => {
        stderrBuffer += chunk.toString();
      });

      proc.on("error", (error) => {
        errorMessage = error instanceof Error ? error.message : String(error);
        reject(error);
      });

      proc.on("close", (code) => {
        if (abortListener && input.signal) input.signal.removeEventListener("abort", abortListener);
        if (stdoutBuffer.trim()) parseLine(stdoutBuffer);
        if (stderrBuffer.trim() && !errorMessage) errorMessage = stderrBuffer.trim();
        resolve(code ?? 0);
      });

      if (input.signal) {
        abortListener = () => {
          aborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => proc.kill("SIGKILL"), 5000).unref();
        };

        if (input.signal.aborted) abortListener();
        else input.signal.addEventListener("abort", abortListener, { once: true });
      }
    });

    return {
      exitCode,
      status: aborted ? "aborted" : exitCode === 0 ? "completed" : "failed",
      stopReason,
      errorMessage,
      finalOutput: finalOutput || undefined,
      usage,
      transcript,
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

export async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TOut>(items.length);
  let nextIndex = 0;

  await Promise.all(
    new Array(limit).fill(null).map(async () => {
      while (true) {
        const current = nextIndex++;
        if (current >= items.length) return;
        results[current] = await fn(items[current], current);
      }
    }),
  );

  return results;
}

async function buildPiArgs(input: RunSingleSubagentInput): Promise<{ args: string[]; tempDir?: string }> {
  const args = ["--mode", "json", "-p", "--no-session"];
  let tempDir: string | undefined;

  if (input.agent.model) {
    args.push("--model", input.agent.model);
  }

  if (!hasThinkingSuffix(input.agent.model)) {
    args.push("--thinking", "minimal");
  }

  const tools = filterToolsForRequest(resolveToolList(input.agent), input.allowWrite, input.allowBash);
  if (tools && tools.length > 0) {
    args.push("--tools", tools.join(","));
  }

  if (input.agent.systemPrompt.trim()) {
    tempDir = await mkdtemp(join(tmpdir(), "pi-subagent-"));
    const promptPath = join(tempDir, `prompt-${sanitizeFileComponent(input.agent.name)}.md`);
    await writeFile(promptPath, input.agent.systemPrompt, { encoding: "utf8", mode: 0o600 });
    args.push("--append-system-prompt", promptPath);
  }

  args.push(`Task: ${input.task}`);
  return { args, tempDir };
}

function filterToolsForRequest(
  tools: string[] | undefined,
  allowWrite: boolean | undefined,
  allowBash: boolean | undefined,
): string[] | undefined {
  if (!tools) return undefined;

  let next = [...tools];
  if (!allowWrite) next = next.filter((tool) => tool !== "write" && tool !== "edit");
  if (!allowBash) next = next.filter((tool) => tool !== "bash");
  return next;
}

function hasThinkingSuffix(model: string | undefined): boolean {
  return Boolean(model && /:[a-z]+$/i.test(model));
}

function sanitizeFileComponent(value: string): string {
  return value.replace(/[^\w.-]+/g, "_");
}
