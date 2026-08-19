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
        enumItemLabels?: unknown[];
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
    viewsContainers?: { activitybar?: Array<{ id: string; title: string; icon: string }> };
    views?: Record<string, Array<{ id: string; name: string }>>;
  };
}

const manifest = JSON.parse(
  readFileSync(path.resolve("package.json"), "utf8")
) as ExtensionManifest;
const englishNls = JSON.parse(
  readFileSync(path.resolve("package.nls.json"), "utf8")
) as Record<string, string>;
const chineseNls = JSON.parse(
  readFileSync(path.resolve("package.nls.zh-cn.json"), "utf8")
) as Record<string, string>;

function resolveEnglish(value: string): string {
  const key = /^%(.+)%$/.exec(value)?.[1];
  return key ? englishNls[key] ?? value : value;
}

describe("extension manifest", () => {
  it("uses the expected branding and command labels", () => {
    expect(manifest.name).toBe("delphi-dcc-builder");
    expect(resolveEnglish(manifest.displayName)).toBe("Delphi DCC Builder");
    expect(resolveEnglish(manifest.description)).toBe(
      "Build Delphi Win32 and Win64 projects with DCC32 and DCC64 from Visual Studio Code."
    );
    expect(manifest.publisher).toBe("1847bell");
    expect(manifest.author).toBe("Alex Niu");
    expect(resolveEnglish(manifest.contributes.configuration.title)).toBe("Delphi DCC Builder");
    expect(manifest.contributes.commands.map((item) => item.command)).toEqual([
      "delphiDcc.createGroup",
      "delphiDcc.sortGroups",
      "delphiDcc.refreshProjects",
      "delphiDcc.renameGroup",
      "delphiDcc.moveGroupUp",
      "delphiDcc.moveGroupDown",
      "delphiDcc.addProjects",
      "delphiDcc.activateConfiguration",
      "delphiDcc.showOutputPaths",
      "delphiXe7.buildProject",
      "delphiXe7.buildProjectWin64",
      "delphiXe7.rebuildProject",
      "delphiXe7.cancelBuild",
      "delphiXe7.showBuildPlan",
      "delphiXe7.changeOutputPath"
    ]);
    expect(manifest.contributes.commands.map((item) => resolveEnglish(item.title))).toEqual([
      "Delphi DCC Builder: New Group",
      "Delphi DCC Builder: Sort Groups",
      "Delphi DCC Builder: Refresh Projects",
      "Delphi DCC Builder: Rename Group",
      "Delphi DCC Builder: Move Group Up",
      "Delphi DCC Builder: Move Group Down",
      "Delphi DCC Builder: Add Dproj Projects",
      "Delphi DCC Builder: Activate Configuration",
      "Delphi DCC Builder: Show Current Output Paths",
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

  it("registers a Delphi Projects activity bar view", () => {
    expect(manifest.contributes.viewsContainers?.activitybar).toContainEqual({
      id: "delphiDcc",
      title: "%viewContainer.delphiProjects%",
      icon: "images/activitybar.svg"
    });
    expect(manifest.contributes.views?.delphiDcc).toEqual(
      expect.arrayContaining([expect.objectContaining({
        id: "delphiDccProjects",
      name: "%view.projects%"
      })])
    );
  });

  it("offers English and Simplified Chinese as the runtime language setting", () => {
    const language = manifest.contributes.configuration.properties["delphiDcc.language"];
    expect(language).toMatchObject({
      type: "string",
      enum: ["en", "zh-cn"],
      default: "en",
      scope: "window"
    });
    expect(language.enumItemLabels).toEqual(["%language.english%", "%language.chinese%"]);
    expect(chineseNls["configuration.language.description"]).toContain("运行时界面");
    expect(chineseNls["command.buildWin32"]).toContain("编译 Win32");
  });

  it("limits per-project output path history through settings", () => {
    expect(manifest.contributes.configuration.properties["delphiXe7.outputPathHistoryLimit"])
      .toMatchObject({ type: "integer", default: 5, minimum: 1, maximum: 15 });
  });
});
