import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let availabilityPromise: Promise<boolean> | undefined;

export interface CmuxTaskHandle {
  enabled: boolean;
  started(mode: string, itemCount: number): Promise<void>;
  update(progress: number, label: string): Promise<void>;
  milestone(message: string): Promise<void>;
  notify(title: string, subtitle: string, body: string): Promise<void>;
  finish(success: boolean, summary: string): Promise<void>;
}

export async function createCmuxTaskHandle(taskLabel: string): Promise<CmuxTaskHandle> {
  const enabled = await isCmuxAvailable();
  if (!enabled) return createNoopHandle();

  return {
    enabled,
    async started(mode: string, itemCount: number) {
      await safeCmux(["set-status", "subagent", `${taskLabel} (${mode}${itemCount > 1 ? `:${itemCount}` : ""})`, "--icon", "bolt"]);
      await safeCmux(["set-progress", "0.05", "--label", `Starting ${taskLabel}`]);
      await safeCmux(["log", "--level", "info", "--source", "pi-subagents", "--", `Started ${taskLabel} (${mode}, ${itemCount} item${itemCount === 1 ? "" : "s"})`]);
      if (itemCount > 1 || mode !== "single") {
        await safeCmux(["notify", "--title", "Subagent run started", "--subtitle", taskLabel, "--body", `${mode} run started with ${itemCount} item${itemCount === 1 ? "" : "s"}`]);
      }
    },
    async update(progress: number, label: string) {
      const clamped = Math.max(0, Math.min(1, progress));
      await safeCmux(["set-progress", clamped.toFixed(2), "--label", label]);
    },
    async milestone(message: string) {
      await safeCmux(["log", "--level", "info", "--source", "pi-subagents", "--", message]);
    },
    async notify(title: string, subtitle: string, body: string) {
      await safeCmux(["notify", "--title", title, "--subtitle", subtitle, "--body", body]);
    },
    async finish(success: boolean, summary: string) {
      await safeCmux(["log", "--level", success ? "info" : "error", "--source", "pi-subagents", "--", summary]);
      await safeCmux(["set-progress", "1.0", "--label", success ? "Subagent run complete" : "Subagent run failed"]);
      await safeCmux(["notify", "--title", success ? "Subagent run complete" : "Subagent run failed", "--subtitle", taskLabel, "--body", summary]);
      await safeCmux(["clear-progress"]);
      await safeCmux(["clear-status", "subagent"]);
    },
  };
}

export async function isCmuxAvailable(): Promise<boolean> {
  if (!availabilityPromise) {
    availabilityPromise = (async () => {
      if (hasCmuxEnv()) return true;
      try {
        await execFileAsync("cmux", ["identify"], { timeout: 2000 });
        return true;
      } catch {
        try {
          await execFileAsync("cmux", ["-h"], { timeout: 2000 });
          return true;
        } catch {
          return false;
        }
      }
    })();
  }
  return availabilityPromise;
}

function hasCmuxEnv(): boolean {
  return Object.keys(process.env).some((key) => key.startsWith("CMUX_"));
}

async function safeCmux(args: string[]): Promise<void> {
  try {
    await execFileAsync("cmux", args, { timeout: 4000 });
  } catch {
    // best-effort only
  }
}

function createNoopHandle(): CmuxTaskHandle {
  return {
    enabled: false,
    async started() {},
    async update() {},
    async milestone() {},
    async notify() {},
    async finish() {},
  };
}
