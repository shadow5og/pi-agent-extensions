import { Type } from "@sinclair/typebox";

export function toPiToolName(serverName: string, toolName: string): string {
  return normalize(`mcp_${serverName}_${toolName}`);
}

export function toPiToolLabel(serverName: string, toolName: string): string {
  return `${serverName}:${toolName}`;
}

export function toTypeBoxSchema(inputSchema: unknown) {
  if (isObjectSchema(inputSchema)) {
    return Type.Unsafe(inputSchema as any);
  }

  return Type.Object({
    arguments: Type.Optional(Type.String({ description: "Optional JSON-encoded arguments" })),
  });
}

export function extractTextContent(content: any): string {
  if (!Array.isArray(content)) return JSON.stringify(content, null, 2);
  const parts = content
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      if (item.type === "text" && typeof item.text === "string") return item.text;
      return JSON.stringify(item, null, 2);
    });
  return parts.join("\n\n").trim();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function isObjectSchema(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
