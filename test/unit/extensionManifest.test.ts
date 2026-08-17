import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSupportedDelphiVersions } from "../../src/delphi/versions";

interface ExtensionManifest {
  name: string;
  displayName: string;
  description: string;
  publisher: string;
  author: string;
  contributes: {
    commands: Array<{
      command: string;
      title: string;
    }>;
    configuration: {
      title: string;
      properties: Record<string, {
        type?: string;
        default?: unknown;
        enum?: unknown[];
        minimum?: number;
        maximum?: number;
      }>;
    };
    menus: {
      "explorer/context": Array<{
        command: string;
        when?: string;
      }>;
    };
  };
}

const manifest = JSON.parse(
  readFileSync(path.resolve("package.json"), "utf8")
) as ExtensionManifest;

describe("extension manifest", () => {
  it("uses the expected branding and command labels", () => {
    expect(manifest.name).toBe("delphi-dcc-builder");
    expect(manifest.displayName).toBe("Delphi DCC Builder");
    expect(manifest.description).toBe(
      "Build Delphi Win32 and Win64 projects with DCC32 and DCC64 from Visual Studio Code."
    );
    expect(manifest.publisher).toBe("1847bell");
    expect(manifest.author).toBe("Alex Niu");
    expect(manifest.contributes.configuration.title).toBe("Delphi DCC Builder");
    expect(manifest.contributes.commands.map((item) => item.command)).toEqual([
      "delphiXe7.buildProject",
      "delphiXe7.buildProjectWin64",
      "delphiXe7.rebuildProject",
      "delphiXe7.cancelBuild",
      "delphiXe7.showBuildPlan",
      "delphiXe7.changeOutputPath"
    ]);
    expect(manifest.contributes.commands.map((item) => item.title)).toEqual([
      "Delphi DCC Builder: Build for Win32",
      "Delphi DCC Builder: Build for Win64",
      "Delphi DCC Builder: Rebuild for Win32",
      "Delphi DCC Builder: Cancel Build",
      "Delphi DCC Builder: Show Build Plan",
      "Delphi DCC Builder: Change Output Path"
    ]);
  });

  it("requires DCC32 while keeping DCC64 optional", () => {
    const properties = manifest.contributes.configuration.properties;
    expect(properties).not.toHaveProperty("delphiXe7.defaultProject");
    expect(properties).not.toHaveProperty("delphiXe7.defaultConfiguration");
    expect(properties["delphiXe7.compilerPath"].default).toBe("");
    expect(properties["delphiXe7.compiler64Path"].default).toBe("");
    expect(properties["delphiXe7.rsvarsPath"].default).toBe("");
    expect(properties["delphiXe7.brcc32Path"].default).toBe("");
    expect(properties["delphiDcc.resourceBuild"].default).toBe(true);
  });

  it("offers the supported Delphi versions as a dropdown", () => {
    expect(manifest.contributes.configuration.properties["delphiDcc.version"])
      .toMatchObject({
        type: "string",
        default: "XE7",
        enum: getSupportedDelphiVersions()
      });
  });

  it("shows Win64 in the context menu only when DCC64 is configured", () => {
    const menu = manifest.contributes.menus["explorer/context"];
    expect(menu.map((item) => item.command)).toEqual([
      "delphiXe7.buildProject",
      "delphiXe7.buildProjectWin64",
      "delphiXe7.changeOutputPath",
      "delphiXe7.showBuildPlan"
    ]);
    expect(menu[1].when).toContain("config.delphiXe7.compiler64Path");
    expect(menu[2].when).toBe("resourceExtname == .dproj");
    expect(menu[3].when).toContain("config.delphiXe7.showBuildPlanMenu == show");
    expect(manifest.contributes.configuration.properties["delphiXe7.showBuildPlanMenu"])
      .toMatchObject({ default: "hide", enum: ["hide", "show"] });
  });

  it("limits per-project output path history through settings", () => {
    expect(manifest.contributes.configuration.properties["delphiXe7.outputPathHistoryLimit"])
      .toMatchObject({ type: "integer", default: 5, minimum: 1, maximum: 15 });
  });
});
