import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BuildJobs } from "./buildJobs";
import { McpConfig, ProjectAccess } from "./config";
import { ProjectService } from "./projects";

const selection = {
  projectFile: z.string().min(1).describe("Existing .dproj path; relative paths use the first configured root."),
  configuration: z.string().min(1).optional().describe("Declared project configuration; omitted uses the .dproj default."),
  platform: z.enum(["Win32", "Win64"]).default("Win32")
};
const editSelection = {
  ...selection,
  configuration: z.string().min(1),
  platform: z.enum(["Win32", "Win64"])
};

async function result(action: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await action() as Record<string, unknown>;
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: data
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
    };
  }
}

export function createMcpServer(config: McpConfig): { server: McpServer; close: () => Promise<void> } {
  const access = new ProjectAccess(config.roots);
  const projects = new ProjectService(config, access);
  const jobs = new BuildJobs(access, config.outputEncoding);
  const server = new McpServer({ name: "delphi-dcc-builder-mcp", version: "0.2.20" });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const writes = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

  server.registerTool("get_project_info", {
    description: "Inspect a Delphi project without compiling: configurations, selected platform, main source, output path, version and parser warnings.",
    inputSchema: z.object(selection).strict(),
    annotations: readOnly
  }, (args) => result(() => projects.getInfo(args)));

  server.registerTool("get_build_plan", {
    description: "Generate a Delphi DCC build plan without writing project files or executing the compiler. Inherited environment values are omitted from the response.",
    inputSchema: z.object({ ...selection, rebuild: z.boolean().default(false) }).strict(),
    annotations: readOnly
  }, (args) => result(async () => {
    const { environment: _environment, ...plan } = await projects.getBuildPlan(args);
    return plan;
  }));

  server.registerTool("start_build", {
    description: "Start an asynchronous Delphi build or rebuild. Writes build artifacts and may create/update project .res files. Returns a jobId; use get_build_status for logs and diagnostics. Does not execute the generated program.",
    inputSchema: z.object({ ...selection, rebuild: z.boolean().default(false) }).strict(),
    annotations: writes
  }, (args, extra) => result(async () => {
    const plan = await projects.getBuildPlan(args);
    if (extra.signal.aborted) throw new Error("Build request was cancelled");
    return jobs.start(plan, extra.signal);
  }));

  server.registerTool("get_build_status", {
    description: "Read a build job and a page of its log. Offsets and limits count JavaScript string characters; continue with nextOffset. Jobs are session-local; only the 50 most recently completed jobs are retained.",
    inputSchema: z.object({
      jobId: z.string().min(1),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(65536).default(16384)
    }).strict(),
    annotations: readOnly
  }, (args) => result(() => jobs.get(args.jobId, args.offset, args.limit)));

  server.registerTool("cancel_build", {
    description: "Request cancellation of an active build, including its child process tree on Windows. Query get_build_status until the job reaches a terminal state.",
    inputSchema: z.object({ jobId: z.string().min(1) }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }, (args) => result(() => jobs.cancel(args.jobId)));

  server.registerTool("set_output_path", {
    description: "Persist DCC_ExeOutput for one explicit configuration/platform in a UTF-8 .dproj. The effective output directory must remain inside configured roots. Fails while that project is building.",
    inputSchema: z.object({ ...editSelection, outputPath: z.string().trim().min(1) }).strict(),
    annotations: writes
  }, (args) => result(() => projects.setOutputPath(args)));

  server.registerTool("set_project_version", {
    description: "Persist file/product version for one explicit configuration/platform in a UTF-8 .dproj. Accepts 1–4 numeric components, each 0–65535. The next resource-enabled build synchronizes the project .res. Fails while the project is building.",
    inputSchema: z.object({ ...editSelection, version: z.string().trim().min(1) }).strict(),
    annotations: { ...writes, idempotentHint: true }
  }, (args) => result(() => projects.setVersion(args)));

  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= (async () => {
    await jobs.close();
    await server.close();
  })();
  return { server, close };
}
