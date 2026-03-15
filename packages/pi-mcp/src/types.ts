export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled?: boolean;
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>;
}

export interface LoadedMcpServerConfig extends McpServerConfig {
  name: string;
  source: "global" | "project";
}

export interface RegisteredMcpToolInfo {
  serverName: string;
  toolName: string;
  piToolName: string;
  description?: string;
  inputSchema?: unknown;
}
