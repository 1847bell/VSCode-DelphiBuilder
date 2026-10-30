import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { mcpBuild } from "./esbuild.mcp.mjs";

if (process.platform !== "win32") {
  throw new Error("MCP ZIP packaging requires Windows PowerShell (Compress-Archive).");
}

const manifest = JSON.parse(await readFile("package.json", "utf8"));
const name = `DelphiBuilder-MCP-${manifest.version}`;
const outputDirectory = path.resolve("release");
const directory = path.join(outputDirectory, name);
const archive = path.join(outputDirectory, `${name}.zip`);
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

for (const file of [
  "dist/mcp.js", "dist/mcp.js.map", "mcp.config.example.json",
  "README.md", "README_CN.md", "CHANGELOG.md",
  "docs/MCP_TRIAL_GUIDE_CN.md", "docs/DELPHI_VERSION_CONFIGURATION.md",
  "skills/delphi-builder-mcp/SKILL.md"
]) {
  const destination = path.join(directory, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(file, destination);
}
await cp("delphi-versions", path.join(directory, "delphi-versions"), { recursive: true });
await mkdir(path.join(directory, "examples/Sample"), { recursive: true });
for (const file of ["Sample.dproj", "Sample.dpr"]) {
  await cp(path.join("test/fixtures", file), path.join(directory, "examples/Sample", file));
}
await writeFile(path.join(directory, "package.json"), JSON.stringify({
  name: "delphibuilder-mcp",
  version: manifest.version,
  private: true,
  description: "Standalone Delphi DCC stdio MCP server",
  engines: { node: ">=22" },
  scripts: { start: "node dist/mcp.js" }
}, null, 2) + "\n");

// Preserve the licenses of packages actually included in the esbuild bundle.
const packages = new Set();
for (const input of Object.keys(mcpBuild.metafile.inputs)) {
  const match = input.replace(/\\/g, "/").match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (match) packages.add(match[1]);
}
const notices = ["Bundled third-party software licenses\n"];
for (const directory of [...packages].sort()) {
  const metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const licenses = (await readdir(directory))
    .filter((file) => /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(file))
    .map((file) => path.join(directory, file));
  // This npm release omits the repository-root license from its published files.
  // Source: https://api.github.com/repos/nodable/val-parsers/git/blobs/561468f111a66df52cc0f1934642bb9fdd22a212
  if (metadata.name === "@nodable/entities" && metadata.version === "3.0.0") {
    licenses.push("licenses/nodable-entities-3.0.0-LICENSE.txt");
  }
  if (licenses.length === 0) {
    throw new Error(`Missing bundled dependency license: ${metadata.name}`);
  }
  notices.push(`\n=== ${metadata.name}@${metadata.version} (${metadata.license ?? "see license below"}) ===\n`);
  for (const file of licenses.sort()) {
    notices.push(`\n--- ${path.basename(file)} ---\n${await readFile(file, "utf8")}\n`);
  }
}
await writeFile(path.join(directory, "THIRD-PARTY-NOTICES.txt"), notices.join(""));

await rm(archive, { force: true });
const quote = (value) => `'${value.replace(/'/g, "''")}'`;
const command = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; Compress-Archive -LiteralPath ${quote(directory)} -DestinationPath ${quote(archive)} -CompressionLevel Optimal`;
const zipped = spawnSync("powershell.exe", [
  "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")
], { stdio: "inherit", windowsHide: true });
if (zipped.error) throw zipped.error;
if (zipped.status !== 0) throw new Error(`Compress-Archive failed: ${zipped.status}`);
const bytes = await readFile(archive);
const digest = createHash("sha256").update(bytes).digest("hex");
await writeFile(`${archive}.sha256`, `${digest}  ${path.basename(archive)}\n`);
console.log(`MCP directory: ${directory}`);
console.log(`MCP archive: ${archive} (${bytes.length} bytes)`);
console.log(`SHA-256: ${digest}`);
