import { describe, expect, it } from "vitest";
import {
  parseSettingValue,
  renderSettingsPage,
  SETTING_DEFINITIONS
} from "../../src/vscode/settingsPage";

describe("extension settings page", () => {
  it("renders every setting in English", () => {
    const html = renderSettingsPage("en", {}, "test-nonce");

    expect(html).toContain("Delphi DCC Builder: Settings");
    expect(html).toContain("DCC32 Path");
    expect(html).toContain("Environment Variables");
    for (const definition of SETTING_DEFINITIONS) {
      expect(html).toContain(`data-setting="${definition.key}"`);
    }
  });

  it("renders translated labels when Chinese is selected", () => {
    const html = renderSettingsPage("zh-cn", {
      "delphiDcc.language": "zh-cn"
    }, "test-nonce");

    expect(html).toContain("Delphi DCC Builder: 设置");
    expect(html).toContain("DCC32 路径");
    expect(html).toContain("环境变量");
    expect(html).toContain('<option value="zh-cn" selected>简体中文</option>');
  });

  it("escapes configured values before inserting them into HTML", () => {
    const html = renderSettingsPage("en", {
      "delphiXe7.compilerPath": '\"><script>alert(1)</script>'
    }, "test-nonce");

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("validates typed and structured values", () => {
    expect(parseSettingValue("delphiDcc.language", "zh-cn")).toBe("zh-cn");
    expect(parseSettingValue("delphiDcc.resourceBuild", false)).toBe(false);
    expect(parseSettingValue("delphiXe7.outputPathHistoryLimit", "15")).toBe(15);
    expect(parseSettingValue("delphiXe7.additionalArguments", '["-B"]')).toEqual(["-B"]);
    expect(parseSettingValue("delphiXe7.environment", '{"BDS":"C:\\\\Delphi"}'))
      .toEqual({ BDS: "C:\\Delphi" });
  });

  it("rejects unknown, out-of-range, and malformed values", () => {
    expect(() => parseSettingValue("unknown.key", "value")).toThrow();
    expect(() => parseSettingValue("delphiDcc.language", "fr")).toThrow();
    expect(() => parseSettingValue("delphiXe7.outputPathHistoryLimit", "16")).toThrow();
    expect(() => parseSettingValue("delphiXe7.additionalArguments", "{}" )).toThrow();
    expect(() => parseSettingValue("delphiXe7.environment", '{"COUNT": 1}')).toThrow();
  });
});
