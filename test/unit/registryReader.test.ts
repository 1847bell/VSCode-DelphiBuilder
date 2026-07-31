import { describe, expect, it } from "vitest";
import { parseRegistryQueryOutput } from "../../src/environment/registryReader";

describe("parseRegistryQueryOutput", () => {
  it("parses values whose names and data contain spaces", () => {
    const output = `
HKEY_CURRENT_USER\\Software\\Embarcadero\\BDS\\15.0\\Library\\Win32
    Search Path    REG_SZ    C:\\Program Files (x86)\\Embarcadero\\lib;D:\\公司\\公共单元
    RootDir    REG_EXPAND_SZ    %ProgramFiles(x86)%\\Embarcadero\\Studio\\15.0
`;
    expect(parseRegistryQueryOutput(output)).toEqual({
      "Search Path": "C:\\Program Files (x86)\\Embarcadero\\lib;D:\\公司\\公共单元",
      RootDir: "%ProgramFiles(x86)%\\Embarcadero\\Studio\\15.0"
    });
  });
});
