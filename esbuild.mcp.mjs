import * as esbuild from "esbuild";

export const mcpBuild = await esbuild.build({
  entryPoints: ["src/mcp/index.ts"],
  bundle: true,
  outfile: "dist/mcp.js",
  format: "cjs",
  platform: "node",
  sourcemap: true,
  target: "node22",
  metafile: true
});
