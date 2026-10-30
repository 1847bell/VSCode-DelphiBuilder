import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectAccess, loadConfig } from "../../src/mcp/config";

let temporary: string;
let root: string;
let access: ProjectAccess;

beforeEach(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), "dcc-mcp-access-"));
  root = path.join(temporary, "project");
  await mkdir(root);
  root = await realpath(root);
  access = new ProjectAccess([root]);
});

afterEach(async () => {
  await rm(temporary, { recursive: true, force: true });
});

describe("MCP project access", () => {
  it("rejects traversal and sibling directories sharing the root prefix", async () => {
    await expect(access.assertPath("../outside/App.dproj")).rejects.toThrow("outside");
    await expect(access.assertPath(`${root}-other/App.dproj`)).rejects.toThrow("outside");
    expect(await access.assertPath("build/new/Sample.exe")).toBe(path.join(root, "build/new/Sample.exe"));
  });

  it("rejects existing and future files reached through an escaping directory link", async () => {
    const outside = path.join(temporary, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "App.dproj"), "<Project />");
    await symlink(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    await expect(access.resolveProject("linked/App.dproj")).rejects.toThrow("outside");
    await expect(access.assertPath("linked/new/build/App.exe")).rejects.toThrow("outside");
  });

  it("holds one project lock until released, independent of the requested operation", () => {
    const project = path.join(root, "App.dproj");
    const release = access.lock(project);
    expect(() => access.lock(project)).toThrow("busy");
    release();

    const releaseNext = access.lock(project);
    expect(() => access.lock(project)).toThrow("busy");
    releaseNext();
  });
  it("rejects dangling links rather than treating them as ordinary future directories", async () => {
    const missingTarget = path.join(temporary, "not-created-yet");
    await symlink(missingTarget, path.join(root, "dangling"), process.platform === "win32" ? "junction" : "dir");
    await expect(access.assertPath("dangling/build/App.exe")).rejects.toThrow("symbolic link");
  });

  it("resolves configured roots and executables relative to the config file", async () => {
    const file = path.join(temporary, "server.json");
    await writeFile(file, JSON.stringify({ roots: ["project"], compilerPath: "tools/dcc32.exe" }));
    const config = await loadConfig(file);
    expect(config.roots).toEqual([root]);
    expect(config.compilerPath).toBe(path.join(temporary, "tools/dcc32.exe"));
    await writeFile(file, JSON.stringify({ roots: ["missing"] }));
    await expect(loadConfig(file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("loads UTF-8 BOM configuration produced by Windows PowerShell", async () => {
    const file = path.join(temporary, "server-bom.json");
    await writeFile(file, `\uFEFF${JSON.stringify({ roots: ["project"], compilerPath: "tools/dcc32.exe" })}`, "utf8");
    const config = await loadConfig(file);
    expect(config.roots).toEqual([root]);
    expect(config.compilerPath).toBe(path.join(temporary, "tools/dcc32.exe"));
    await writeFile(file, "\uFEFF{invalid json", "utf8");
    await expect(loadConfig(file)).rejects.toBeInstanceOf(SyntaxError);
  });
});
