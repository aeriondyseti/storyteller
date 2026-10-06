import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ZodRawShape, z } from "zod";
import { StoryError } from "../src/errors.ts";
import { ToolError, type WorldContext } from "./context.ts";

// A world tool: a name, a description written for the Storyteller (when to use
// it), a zod input shape, and a handler that returns the text the model reads.
// `call` validates raw input itself, so tests can call handlers directly with
// the same checks the MCP client gets.

export type Tool = {
  name: string;
  description: string;
  input: ZodRawShape;
  call: (ctx: WorldContext, args: unknown) => Promise<string>;
};

export function defineTool<S extends ZodRawShape>(tool: {
  name: string;
  description: string;
  input: S;
  run: (ctx: WorldContext, args: z.infer<z.ZodObject<S>>) => Promise<string>;
}): Tool {
  const schema = z.object(tool.input);
  return {
    name: tool.name,
    description: tool.description,
    input: tool.input,
    call: (ctx, args) => tool.run(ctx, schema.parse(args ?? {})),
  };
}

// Errors become one clear sentence for the model, never a stack trace.
export function errorMessage(error: unknown): string {
  if (error instanceof ToolError || error instanceof StoryError) return error.message;
  if (error instanceof z.ZodError) {
    return `Invalid input: ${error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ")}`;
  }
  return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
}

export function createServer(ctx: WorldContext, tools: Tool[]): McpServer {
  const server = new McpServer({ name: "world", version: "0.1.0" });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input },
      async (args: unknown) => {
        try {
          return { content: [{ type: "text", text: await tool.call(ctx, args) }] };
        } catch (error) {
          return { content: [{ type: "text", text: errorMessage(error) }], isError: true };
        }
      },
    );
  }
  return server;
}
