# Delphi DCC Builder

Build Delphi Win32 and Win64 projects from Visual Studio Code by invoking `DCC32.exe` or `DCC64.exe` directly. Delphi XE7 is currently supported, with version-specific build configuration isolated for future compiler versions.

Current version: `0.2.9`

## Commands

- `Delphi DCC Builder: Build for Win32`
- `Delphi DCC Builder: Build for Win64`
- `Delphi DCC Builder: Rebuild for Win32`
- `Delphi DCC Builder: Cancel Build`
- `Delphi DCC Builder: Change Output Path`
- `Delphi DCC Builder: Show Build Plan`

Select the compiler version with `delphiDcc.version`; the only current option is `XE7`. `delphiXe7.compilerPath` is required for Win32. `delphiXe7.compiler64Path` is optional; when it is non-empty, the `.dproj` Explorer context menu includes **Build for Win64**. Each build reads the project and prompts for one of its declared configurations. Rebuild remains available for Win32 from the Command Palette. **Show Build Plan** is always available from the Command Palette and can be enabled in the Explorer context menu with `delphiXe7.showBuildPlanMenu`.

Resource preprocessing is enabled by `delphiDcc.resourceBuild`. Projects containing `.dproj` `RcCompile` items are compiled with `BRCC32.exe` before DCC. When the main `.dpr` or `.dpk` contains `{$R *.res}` but the matching project `.res` is missing, the extension creates a minimal valid project resource before DCC and never overwrites an existing file. `delphiXe7.rsvarsPath` and `delphiXe7.brcc32Path` are optional BRCC32 discovery overrides. Project-level `RcItem` generation is not emulated and is reported as a Build Plan warning when encountered.

When a workspace contains multiple `.dproj` files, the project picker initially shows up to 10 recently used projects for that workspace. A workspace with no history starts with an empty list; typing still searches all `.dproj` files in the open workspace.

Right-click a `.dproj` and select **Change Output Path** to edit the effective `DCC_ExeOutput`. The current value is prefilled, and both the previous and new values are retained after a successful change. History is isolated by the normalized full `.dproj` path and limited by `delphiXe7.outputPathHistoryLimit` (default `5`, range `1`-`15`). The selected path is saved as an override for the chosen configuration and platform, so changing `Release|Win32` does not change another configuration or platform.

## Current scope

- Windows, Delphi XE7/BDS 15.0, DCC32/Win32 and optional DCC64/Win64
- `.dproj` projects whose build can be represented by direct DCC arguments
- Debug, Release and project-defined configurations
- Platform-specific BDS 15.0 Library Path and Debug DCU Path expansion

Imported MSBuild targets and build events are not executed. Resource preprocessing is limited to missing wildcard project resources and `RcCompile` items. The extension invokes BDS `BRCC32.exe` for `RcCompile` with the evaluated BRCC/DCC defines, include paths, code page, language, suffix, and output directory. Unsupported project properties are reported in the Build Plan warnings so they are not silently ignored.

## Delphi version configurations

Version-specific BDS metadata and DCC command mappings are stored as readable JSON files in `delphi-versions/`. The current implementation is `delphi-versions/XE7.json`, and `delphi-versions/schema.json` documents and validates the format.

Each version file defines:

- BDS registry and Studio directory versions
- Win32/Win64 compiler file names and VS Code setting names
- base and rebuild arguments
- special search-path and runtime-package switches
- `.dproj` value and path property mappings
- ordered boolean and enum argument rules
- recognized DCC metadata properties

The order of `dcc.argumentRules` is the emitted DCC argument order. Empty arrays intentionally suppress an argument for that value.

To add a Delphi version, copy `XE7.json`, update its version/BDS data and DCC mappings, then add the version to the `delphiDcc.version` `enum` and `enumItemLabels` in `package.json`. Add the corresponding compiler path settings referenced by `settingsSection` and `compilerSettingNames`. The runtime discovers every JSON file in `delphi-versions/` except `schema.json`; TypeScript changes are only needed when a compiler requires behavior that cannot be represented by the existing configuration schema. Add unit tests and a real compiler integration test before declaring a version supported.

See `docs/DELPHI_VERSION_CONFIGURATION.md` for the complete contributor handbook, including every schema field, argument ordering, VS Code manifest registration, testing, packaging, and troubleshooting steps.

## Development

```powershell
npm install
npm test
npm run check
npm run compile
npm run package
```
