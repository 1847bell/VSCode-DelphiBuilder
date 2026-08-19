import en from "../../src/localization/locales/en.json";
import zhCn from "../../src/localization/locales/zh-cn.json";
import {
  getLanguage,
  localize,
  resolveLanguage,
  setLanguage
} from "../../src/localization/localizer";
import { afterEach, describe, expect, it } from "vitest";

describe("runtime localization", () => {
  afterEach(() => setLanguage("en"));

  it("uses English by default and interpolates named values", () => {
    expect(getLanguage()).toBe("en");
    expect(localize("tree.projectCount.other", { count: 3 })).toBe("3 projects");
  });

  it("switches to Simplified Chinese", () => {
    setLanguage(resolveLanguage("zh-cn"));
    expect(localize("tree.projectCount.other", { count: 3 })).toBe("3 个项目");
  });

  it("falls back to English for unsupported settings", () => {
    expect(resolveLanguage("fr")).toBe("en");
    expect(resolveLanguage(undefined)).toBe("en");
  });

  it("keeps the English and Chinese resource keys aligned", () => {
    expect(Object.keys(zhCn).sort()).toEqual(Object.keys(en).sort());
  });
});
