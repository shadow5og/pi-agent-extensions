import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@mariozechner/pi-coding-agent";

import { addGlobalServer, getGlobalMcpConfigPath, getProjectMcpConfigPath, loadMergedMcpConfig, removeGlobalServer } from "./config";
import { McpManager } from "./mcp-manager";
import { extractTextContent, toPiToolLabel, toPiToolName, toTypeBoxSchema } from "./tool-mapper";
import type { LoadedMcpServerConfig, RegisteredMcpToolInfo } from "./types";

export default function (pi: ExtensionAPI) {
  const manager = new McpManager();
  let currentTools: RegisteredMcpToolInfo[] = [];

  const syncTools = async (cwd: string) => {
    const configs = await loadMergedMcpConfig(cwd);
    currentTools = await manager.connectServers(configs);
    registerMcpTools(currentTools);
    refreshActiveTools();
    return configs;
  };

  const registerMcpTools = (tools: RegisteredMcpToolInfo[]) => {
    for (const tool of tools) {
      const piToolName = toPiToolName(tool.serverName, tool.toolName);
      tool.piToolName = piToolName;
      pi.registerTool({
        name: piToolName,
        label: toPiToolLabel(tool.serverName, tool.toolName),
        description: tool.description || `MCP tool ${tool.toolName} from ${tool.serverName}`,
        parameters: toTypeBoxSchema(tool.inputSchema),
        async execute(_toolCallId, params) {
          const response = await manager.callTool(tool.serverName, tool.toolName, params as Record<string, unknown>);
          const rawText = extractTextContent(response.content);
          const truncation = truncateHead(rawText, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
          let text = truncation.content;
          if (truncation.truncated) {
            text += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
          }
          return {
            content: [{ type: "text", text: text || "(no text output)" }],
            details: response,
          };
        },
      });
    }
  };

  const refreshActiveTools = () => {
    const active = pi.getActiveTools().filter((name) => !name.startsWith("mcp_"));
    pi.setActiveTools([...active, ...currentTools.map((tool) => tool.piToolName)]);
  };

  pi.on("session_start", async (_event, ctx) => {
    try {
      const configs = await syncTools(ctx.cwd);
      if (ctx.hasUI) {
        ctx.ui.notify(`MCP: ${configs.length} server(s), ${currentTools.length} tool(s) loaded`, "info");
      }
    } catch (error) {
      if (ctx.hasUI) {
        ctx.ui.notify(`MCP load failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    }
  });

  pi.on("session_shutdown", async () => {
    await manager.disconnectAll();
  });

  pi.registerCommand("mcp-list", {
    description: "List configured MCP servers and loaded MCP tools",
    handler: async (_args, ctx) => {
      const configs = await loadMergedMcpConfig(ctx.cwd);
      const servers = manager.listServers();
      const lines = [
        `Global config: ${getGlobalMcpConfigPath()}`,
        `Project config: ${getProjectMcpConfigPath(ctx.cwd)}`,
        `Configured servers: ${configs.length}`,
      ];
      for (const server of servers) {
        lines.push(`- ${server.name}: ${server.tools.length} tool(s)`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("mcp-reload", {
    description: "Reload MCP config and reconnect MCP servers",
    handler: async (_args, ctx) => {
      const configs = await syncTools(ctx.cwd);
      ctx.ui.notify(`MCP reloaded: ${configs.length} server(s), ${currentTools.length} tool(s)`, "success");
    },
  });

  pi.registerCommand("mcp-add", {
    description: "Add a global stdio MCP server: /mcp-add <name> <command> [args...]",
    handler: async (args, ctx) => {
      const parts = (args || "").trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        ctx.ui.notify("Usage: /mcp-add <name> <command> [args...]", "error");
        return;
      }
      const [name, command, ...commandArgs] = parts;
      await addGlobalServer(name, { command, args: commandArgs });
      await syncTools(ctx.cwd);
      ctx.ui.notify(`Added MCP server ${name}`, "success");
    },
  });

  pi.registerCommand("mcp-remove", {
    description: "Remove a global MCP server: /mcp-remove <name>",
    handler: async (args, ctx) => {
      const name = (args || "").trim();
      if (!name) {
        ctx.ui.notify("Usage: /mcp-remove <name>", "error");
        return;
      }
      const removed = await removeGlobalServer(name);
      await syncTools(ctx.cwd);
      ctx.ui.notify(removed ? `Removed MCP server ${name}` : `No MCP server named ${name}`, removed ? "success" : "error");
    },
  });
}
