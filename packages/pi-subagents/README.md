# @local/pi-subagents

Pi subagent extension for delegating work to specialized child Pi runs.

## Features

- `subagent` tool with single, parallel, and chain execution
- slash commands:
  - `/agents`
  - `/chains`
  - `/run <agent> <task>`
  - `/parallel agent -- task -> agent -- task`
  - `/chain agent -- task -> agent -- task`
  - `/run-chain <name> [task]`
- reusable `.chain.md` chain definitions from user/project agent directories
- project agent discovery walks up parent directories
- built-in default agents:
  - `explore`
  - `scout`
  - `planner`
  - `worker`
  - `reviewer`
- richer agent frontmatter support:
  - `model`
  - `thinking`
  - `skills`
  - `tools`
  - `maxSteps`
- automatic cmux integration when cmux is available:
  - status updates
  - progress updates
  - milestone logs
  - completion notifications
- persistent session run history via `/subagent-history`

## Contents

- `src/index.ts` — registers the `subagent` tool and command layer
- `src/agents.ts` — loads default, user, and project agents
- `src/runner.ts` — launches subprocess subagents via `pi --mode json -p --no-session`
- `src/schema.ts` — shared types and schemas
- `src/commands.ts` — slash command helpers for subagent workflows
- `src/cmux.ts` — best-effort cmux status/progress/notify integration
- `agents/` — bundled sample agents

## Installed symlinks

Extension:
- `~/.pi/agent/extensions/pi-subagents/index.ts`
- `~/.pi/agent/extensions/pi-subagents/agents.ts`
- `~/.pi/agent/extensions/pi-subagents/runner.ts`
- `~/.pi/agent/extensions/pi-subagents/schema.ts`
- `~/.pi/agent/extensions/pi-subagents/commands.ts`
- `~/.pi/agent/extensions/pi-subagents/cmux.ts`

Bundled agents:
- `~/.pi/agent/agents/explore.md`
- `~/.pi/agent/agents/scout.md`
- `~/.pi/agent/agents/planner.md`
- `~/.pi/agent/agents/worker.md`
- `~/.pi/agent/agents/reviewer.md`
