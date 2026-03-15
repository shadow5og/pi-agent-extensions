# @local/pi-mcp

Pi extension that adds a configurable MCP bridge.

## Features
- load MCP server config from global/project config files
- connect to stdio MCP servers
- dynamically register Pi tools for discovered MCP tools
- commands for list/reload/add/remove

## Config files
Pi MCP config is loaded from:
- `~/.pi/agent/mcp.json`
- `.pi/mcp.json`

Project config overrides global config by server name.

## Config format
Example: `mcp.example.json`

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "./test.db"],
      "env": {},
      "enabled": true
    }
  }
}
```

## Commands
- `/mcp-list` — list configured/connected MCP servers
- `/mcp-reload` — reload config and reconnect servers
- `/mcp-add <name> <command> [args...]` — add a global stdio MCP server entry
- `/mcp-remove <name>` — remove a global MCP server entry

## Installed symlinks
Extension:
- `~/.pi/agent/extensions/pi-mcp/index.ts`
- `~/.pi/agent/extensions/pi-mcp/config.ts`
- `~/.pi/agent/extensions/pi-mcp/mcp-manager.ts`
- `~/.pi/agent/extensions/pi-mcp/tool-mapper.ts`
- `~/.pi/agent/extensions/pi-mcp/types.ts`

## Notes
- MCP tools are dynamically registered with names like `mcp_<server>_<tool>`.
- Tool names are normalized to lowercase/underscore form.
- MCP tool output is truncated before returning to the model.
- Run `/reload` in Pi after editing config files if needed.
