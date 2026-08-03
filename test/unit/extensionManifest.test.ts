import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface ExtensionManifest {
  name: string;
  displayName: string;
  contributes: {
    commands: Array<{
      command: string;
      title: string;
    }>;
    configuration: {
      title: string;
      properties: Record<string, {
        default?: unknown;
        enum?: unknown[];
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
  it("uses the Delphi DCC Builder brand while preserving stable command identifiers", () => {
    expect(manifest.name).toBe("delphi-dcc-builder");
    expect(manifest.displayName).toBe("Delphi DCC Builder");
    expect(manifest.contributes.configuration.title).toBe("Delphi DCC Builder");
    expect(manifest.contributes.commands.map((item) => item.command)).toEqual([
      "delphiXe7.buildProject",
      "delphiXe7.rebuildProject",
      "delphiXe7.cancelBuild",
      "delphiXe7.showBuildPlan"
    ]);
    expect(manifest.contributes.commands.every((item) =>
      item.title.startsWith("Delphi DCC Builder:"))).toBe(true);
  });

  it("requires an explicit compiler path and has no project or configuration defaults", () => {
    const properties = manifest.contributes.configuration.properties;
    expect(properties).not.toHaveProperty("delphiXe7.defaultProject");
    expect(properties).not.toHaveProperty("delphiXe7.defaultConfiguration");
    expect(properties["delphiXe7.compilerPath"].default).toBe("");
  });

  it("keeps the context menu focused on Build and optionally Show Build Plan", () => {
    const menu = manifest.contributes.menus["explorer/context"];
    expect(menu.map((item) => item.command)).toEqual([
      "delphiXe7.buildProject",
      "delphiXe7.showBuildPlan"
    ]);
    expect(menu[1].when).toContain("config.delphiXe7.showBuildPlanMenu == show");
    expect(manifest.contributes.configuration.properties["delphiXe7.showBuildPlanMenu"])
      .toMatchObject({ default: "hide", enum: ["hide", "show"] });
  });
});
