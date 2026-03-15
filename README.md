# pi-agent-extensions

A local monorepo for Pi extensions.

## Structure

- `packages/pi-subagents/`
  - OpenCode-inspired Pi subagent extension
- `packages/pi-mcp/`
  - configurable MCP bridge extension for Pi
- `packages/pi-skill-inline/`
  - inline `$skill-name` expansion extension for Pi

## What’s included

This monorepo currently packages three practical Pi extensions:

- **`pi-subagents`**
  - a visible subagent orchestration extension for Pi
  - supports single, parallel, and chain execution modes
  - includes built-in `explore`, `worker`, and `reviewer` agents
  - renders execution progress and summarized results in the Pi UI

- **`pi-mcp`**
  - a configurable MCP bridge for Pi
  - loads MCP server definitions from project and global config files
  - dynamically exposes discovered MCP tools inside Pi
  - includes helper commands for listing, reloading, adding, and removing MCP servers

- **`pi-skill-inline`**
  - enables inline skill usage via `$skill-name` references inside prompts
  - supports multiple inline skills per prompt with deduplication
  - ignores fenced code blocks during expansion
  - includes helper commands for listing, inserting, and picking skills interactively

## Workspaces

This repo uses npm workspaces:

- root workspace manifest: `package.json`
- shared TS config: `tsconfig.base.json`
- per-extension package manifests under `packages/*`

## Installed extensions

Pi auto-discovery symlinks currently point to:
- `~/.pi/agent/extensions/pi-subagents/`
- `~/.pi/agent/extensions/pi-mcp/`
- `~/.pi/agent/extensions/pi-skill-inline/`
- `~/.pi/agent/agents/`

## Current packages

### `packages/pi-subagents`
- child Pi-run based subagents
- custom rendering and progress UI
- bundled default agents: `explore`, `scout`, `planner`, `worker`, `reviewer`
- slash commands: `/agents`, `/chains`, `/inspect-agent`, `/inspect-chain`, `/favorite-agent`, `/favorite-chain`, `/run`, `/parallel`, `/chain`, `/run-chain`, `/subagent-history`
- reusable `.chain.md` chain definitions for multi-step workflows
- richer agent frontmatter support including `thinking` and injected `skills`
- interactive inspection flows for agents, chains, and recent run history
- pinned favorites for agents and chains
- automatic cmux status/progress/log/notify integration when cmux is available

### `packages/pi-mcp`
- loads MCP server config from global/project config files
- connects to stdio MCP servers
- dynamically registers Pi tools for discovered MCP tools
- provides commands for list/reload/add/remove

### `packages/pi-skill-inline`
- rewrites `$skill-name` tokens inline before Pi processes the prompt
- supports multiple inline skills in one prompt
- provides `/skills-inline`, `/insert-skill <name>`, and `/pick-skill`
- expands inline skills at submit time; native `$` editor autocomplete is not currently provided by Pi extension APIs

## cmux-first workflow guidance

This repo is also configured to encourage a cmux-first workflow when cmux is available.

That means Pi should prefer to:
- detect cmux availability via `cmux -h`, `cmux identify`, or `CMUX_*` environment variables
- use cmux APIs for orchestration instead of ad-hoc terminal control
- inspect the current layout before creating new panes or surfaces
- show progress with `cmux set-status`, `cmux set-progress`, and `cmux log`
- notify the user with `cmux notify` for milestones, approvals, long-running work, and completion
- use cmux panes for heavy or long-running work, including work done alongside subagents
- monitor background panes with `cmux read-screen`
- clean up panes and sidebar state when work is done

## Notes

- project-level appended prompt guidance lives at `.pi/APPEND_SYSTEM.md`
- a matching global appended prompt can be installed at `~/.pi/agent/APPEND_SYSTEM.md`
- use `/reload` or start a new Pi session after changing prompt/context files
