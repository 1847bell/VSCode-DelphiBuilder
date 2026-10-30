import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config";
import { createMcpServer } from "./server";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--config") {
    throw new Error("Usage: node dist/mcp.js --config <config.json>");
  }
  const config = await loadConfig(args[1]);
  const { server, close } = createMcpServer(config);
  const shutdown = (): void => {
    void close().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.stdin.once("end", shutdown);
  server.server.onclose = shutdown;
  await server.connect(new StdioServerTransport());
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
