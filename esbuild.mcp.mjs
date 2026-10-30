import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/mcp/index.ts"],
  bundle: true,
  outfile: "dist/mcp.js",
  format: "cjs",
  platform: "node",
  sourcemap: true,
  target: "node20",
  packages: "external"
});
