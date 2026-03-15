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

If cmux is available in the environment (for example `cmux -h` succeeds, `cmux identify` works, or CMUX_* environment variables are present), prefer using cmux APIs and workflows as much as possible.

When cmux is available:
- Prefer `cmux` APIs over ad-hoc terminal orchestration.
- Use `cmux identify`, `current-workspace`, `list-panes`, and `list-pane-surfaces` to understand the current layout before creating new panes.
- Use `cmux set-status`, `set-progress`, and `log` to show progress continuously during meaningful work.
- Use `cmux notify` to inform the user about important milestones, approvals needed, long-running background work starting, and final completion.
- Prefer spawning terminal panes for heavy or long-running work, especially when:
  - a task may take a while
  - multiple investigations can run in parallel
  - background observation/monitoring is useful
  - a subprocess or secondary Pi/agent instance can reduce turnaround time
- Prefer combining `cmux` panes with subagents for expensive or parallelizable work.
- Read progress from spawned panes with `cmux read-screen` and `--scrollback` as needed.
- Close panes and clear sidebar status/progress when they are no longer needed.
- Use `cmux wait-for` when synchronization is cleaner than polling.
- If user-visible progress matters, keep cmux sidebar state accurate throughout execution.

When using cmux with this repo:
- Be proactive about using multiple panes for parallel work.
- Capture returned `surface:` refs from `cmux new-pane` or `new-surface` and reuse them carefully.
- Prefer file-based communication for large outputs and screen reads for lightweight monitoring.
- Use subagents directly when they are enough; use cmux panes in addition when work is heavy, long-running, or benefits from persistent monitoring.
- Clean up orchestration artifacts when done.