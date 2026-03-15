# Changelog

All notable changes to the `pi-agent-extensions` repository will be documented in this file.

## [Unreleased]

### Added
- **`pi-subagents`:** Added new slash commands for agent and chain management (`/agents`, `/chains`, `/inspect-agent`, `/inspect-chain`, `/run`, `/parallel`, `/chain`, `/run-chain`, `/subagent-history`, `/favorite-agent`, `/favorite-chain`).
- **`pi-subagents`:** Added support for reusable `.chain.md` chain definitions, discoverable from user and project agent directories.
- **`pi-subagents`:** Added project agent and chain discovery that walks up parent directories.
- **`pi-subagents`:** Added two new built-in default agents: `scout` and `planner`.
- **`pi-subagents`:** Added interactive browse and inspection flows in the Pi TUI for agents, chains, and recent run history.
- **`pi-subagents`:** Added agent frontmatter support for `model`, `thinking`, `skills`, `tools`, and `maxSteps`.
- **`pi-subagents`:** Agents can now inject external `skills` directly into their system prompt during execution.
- **`pi-subagents`:** Added persistent session run history, queryable via `/subagent-history`.
- **`pi-subagents`:** Added pinned favorites for agents and chains, stored persistently in `~/.pi/agent/subagent-favorites.json`.
- **`pi-subagents`:** Added automatic, native `cmux` integration (status updates, progress tracking, milestone logs, and completion notifications).
- **Core:** Added the `chrome-devtools-cli` skill.
- **Core:** Hardened cmux orchestration rules in `.pi/APPEND_SYSTEM.md`.

### Changed
- **`pi-subagents`:** Refactored internal architecture into clearer modules (`commands.ts`, `chains.ts`, `execution.ts`, `render.ts`, `cmux.ts`, `history.ts`, `skills.ts`, `favorites.ts`).
- **`pi-subagents`:** Subagent slash commands now execute subagent tasks directly instead of prompting the model to invoke the `subagent` tool.
- **`pi-subagents`:** Reduced default model thinking overhead to `minimal` to improve subagent performance and response latency.
- **`pi-subagents`:** Tightened the `planner` agent prompt to improve adherence to concise constraints.

### Fixed
- **`pi-subagents`:** Fixed print-mode (`-p`) behavior for direct slash commands to prevent hanging.
- **`pi-subagents`:** Fixed agent discovery bug where `.chain.md` files were incorrectly treated as standard agent definitions.
- **`pi-subagents`:** Fixed multiple syntax and module import errors during the upgrade process.
