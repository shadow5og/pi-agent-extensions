# @local/pi-subagents

Pi subagent extension for delegating work to specialized child Pi runs.

## Contents

- `src/index.ts` — registers the `subagent` tool
- `src/agents.ts` — loads default, user, and project agents
- `src/runner.ts` — launches subprocess subagents via `pi --mode json -p --no-session`
- `src/schema.ts` — shared types and schemas
- `agents/` — bundled sample agents (`explore`, `worker`, `reviewer`)

## Installed symlinks

Extension:
- `~/.pi/agent/extensions/pi-subagents/index.ts`
- `~/.pi/agent/extensions/pi-subagents/agents.ts`
- `~/.pi/agent/extensions/pi-subagents/runner.ts`
- `~/.pi/agent/extensions/pi-subagents/schema.ts`

Bundled agents:
- `~/.pi/agent/agents/explore.md`
- `~/.pi/agent/agents/worker.md`
- `~/.pi/agent/agents/reviewer.md`
