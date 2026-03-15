import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { LoadedMcpServerConfig, RegisteredMcpToolInfo } from "./types";

interface ConnectionState {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  tools: RegisteredMcpToolInfo[];
}

export class McpManager {
  private connections = new Map<string, ConnectionState>();

  async connectServers(configs: LoadedMcpServerConfig[]): Promise<RegisteredMcpToolInfo[]> {
    await this.disconnectAll();
    const registered: RegisteredMcpToolInfo[] = [];

    for (const config of configs) {
      const state = await this.connectServer(config);
      this.connections.set(config.name, state);
      registered.push(...state.tools);
    }

    return registered;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>) {
    const state = this.connections.get(serverName);
    if (!state) throw new Error(`MCP server not connected: ${serverName}`);
    const response = await state.client.callTool({ name: toolName, arguments: args as any });
    return response as any;
  }

  listServers(): Array<{ name: string; tools: RegisteredMcpToolInfo[] }> {
    return [...this.connections.values()].map((state) => ({
      name: state.name,
      tools: state.tools,
    }));
  }

  async disconnectAll(): Promise<void> {
    for (const state of this.connections.values()) {
      try {
        await state.transport.close();
      } catch {
        // ignore
      }
      try {
        await state.client.close();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
  }

  private async connectServer(config: LoadedMcpServerConfig): Promise<ConnectionState> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      cwd: config.cwd,
    });

    const client = new Client({ name: `pi-mcp-${config.name}`, version: "0.1.0" });
    await client.connect(transport);
    const toolsResult = await client.listTools();
    const tools = (toolsResult.tools ?? []).map((tool: any) => ({
      serverName: config.name,
      toolName: tool.name,
      piToolName: "",
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return {
      name: config.name,
      client,
      transport,
      tools,
    };
  }
}
