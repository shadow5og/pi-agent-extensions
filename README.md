# pi-agent-extensions

A local monorepo for Pi extensions.

## Structure

- `packages/pi-subagents/`
  - OpenCode-inspired Pi subagent extension
- `packages/pi-mcp/`
  - configurable MCP bridge extension for Pi

## Workspaces

This repo uses npm workspaces:

- root workspace manifest: `package.json`
- shared TS config: `tsconfig.base.json`
- per-extension package manifests under `packages/*`

## Installed extensions

Pi auto-discovery symlinks currently point to:
- `~/.pi/agent/extensions/pi-subagents/`
- `~/.pi/agent/extensions/pi-mcp/`
- `~/.pi/agent/agents/`

## Current packages

### `packages/pi-subagents`
- child Pi-run based subagents
- custom rendering and progress UI
- bundled sample agents

### `packages/pi-mcp`
- loads MCP server config from global/project config files
- connects to stdio MCP servers
- dynamically registers Pi tools for discovered MCP tools
- provides commands for list/reload/add/remove
