---
name: chrome-devtools-cli
description: Use Chrome DevTools MCP through a local mcp2cli wrapper for browser automation, debugging, and page inspection.
allowed-tools: Bash(bash *)
---

Use the local wrapper:

- `${CLAUDE_SKILL_DIR}/scripts/chrome-devtools`

Tip: start every task by listing commands and checking command-specific help.

## 1) Discover commands

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools --list
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools --search "network"
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools <command> --help
```

## 2) Page lifecycle workflow (open → inspect → capture → close)

```bash
# Open a page
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools new-page --url "https://example.com" --pretty

# Inspect current state
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools take-snapshot --pretty

# Capture evidence
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools take-screenshot --pretty

# Optional: close the page/target when done (check exact command via --search "close")
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools --search "close"
```

## 3) Interaction workflow (find → act → wait → verify)

```bash
# 1. Find candidate element UIDs from snapshot
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools take-snapshot --pretty

# 2. Interact
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools click --uid <uid>
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools fill --uid <uid> --value "hello"

# 3. Wait for expected state
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools wait-for --text "Welcome"

# 4. Verify outcome
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools take-screenshot --pretty
```

## 4) Debugging workflow (console + network + runtime)

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools list-console-messages --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools list-network-requests --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools evaluate-script --function "() => ({ title: document.title, url: location.href })" --pretty
```

Use this loop for fast triage:
1. Reproduce with click/fill/wait-for.
2. Inspect console and failed/slow requests.
3. Run evaluate-script to inspect in-page state.
4. Take screenshot/snapshot for evidence.

## 5) Performance workflow (baseline → analyze → compare)

```bash
# Discover perf-related commands in your current generated CLI
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools --search "performance"
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools --search "trace"

# Keep a repeatable capture sequence
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools new-page --url "https://example.com" --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools list-network-requests --pretty
bash ${CLAUDE_SKILL_DIR}/scripts/chrome-devtools take-screenshot --pretty
```

When performance commands are available in your environment, run them with identical steps across baseline and candidate builds, then compare totals/timings.

## Notes

- Commands are generated dynamically from Chrome DevTools MCP and may vary.
- Prefer `--pretty` during investigation for readable output.
- If unsure about arguments, always run `<command> --help`.
- Chrome starts automatically on first command invocation.
