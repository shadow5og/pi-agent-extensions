Prefer using subagents by default for non-trivial work in this repository.

Available extension workflow:
- Use the `subagent` tool for delegated work.
- Prefer `explore` for read-only investigation and repo reconnaissance.
- Prefer `worker` for focused implementation tasks.
- Prefer `reviewer` for review, risk analysis, and follow-up improvements.

When to delegate:
- broad codebase exploration
- parallelizable independent investigations
- multi-step tasks where intermediate summaries help
- implementation work that can be isolated cleanly
- review passes after meaningful changes

When not to delegate:
- trivial one-file reads
- very small direct edits that are faster inline
- simple factual answers that do not benefit from isolation

Execution preferences:
- Prefer parallel subagents for independent tasks.
- Prefer chain mode when later steps depend on earlier output.
- Use direct work only when delegation overhead is not justified.
- Summarize and synthesize subagent output clearly after delegation.

This repository contains Pi extensions, so actively consider subagents and extension-based workflows first.

If cmux is available in the environment (for example `cmux -h` succeeds, `cmux identify` works, or CMUX_* environment variables are present), the agent must use cmux APIs and workflows as much as reasonably possible unless the task is truly trivial.

Treat the following as required behavior whenever cmux is available and the task is not trivial:
- Use `cmux identify` and layout inspection commands such as `current-workspace`, `list-panes`, and `list-pane-surfaces` near the start of meaningful work before creating new panes.
- Use `cmux set-status` to show the current task or phase.
- Use `cmux log` for meaningful milestones and state changes.
- Use `cmux set-progress` for multi-step work, longer-running work, or anything user-visible enough to benefit from progress reporting.
- Use `cmux notify` to inform the user about important milestones, approval needs, long-running work starting, and final completion.

Pane usage rules when cmux is available:
- Use cmux panes or surfaces for heavy, long-running, parallel, or monitorable work.
- Prefer spawning panes when a task may take time, when monitoring background output is useful, when multiple investigations can run in parallel, or when a subprocess / secondary Pi / agent instance can reduce turnaround time.
- Prefer combining cmux panes with subagents for expensive or parallelizable work.
- Capture returned `surface:` refs from `cmux new-pane` or `new-surface` and reuse them carefully.
- Read progress from spawned panes with `cmux read-screen` and `--scrollback` as needed.
- Use `cmux wait-for` when synchronization is cleaner than polling.

Cleanup rules when cmux is available:
- Close temporary panes and surfaces when they are no longer needed.
- Clear sidebar status and progress when the work is done.
- Keep cmux sidebar state accurate throughout execution; do not leave stale progress behind.

When deciding whether cmux use is required, treat the following as non-trivial by default:
- multi-step implementation work
- repo exploration beyond a tiny one-file read
- parallel investigations
- long-running commands or tests
- background monitoring
- work involving subagents

When using cmux with this repo:
- Be proactive about using multiple panes for parallel work.
- Prefer file-based communication for large outputs and screen reads for lightweight monitoring.
- Use subagents directly when they are enough; use cmux panes in addition when work is heavy, long-running, or benefits from persistent monitoring.
- Clean up orchestration artifacts when done.
