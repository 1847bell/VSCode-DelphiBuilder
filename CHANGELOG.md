# Change Log

## 0.2.9

- Detect `{$R *.res}` in the project main source and create a minimal valid project `.res` when it is missing.
- Preserve existing project resources, expose the create-if-missing action in the Build Plan, and cover it with real XE7 compilation tests.

## 0.2.8

- Compile `.dproj` `RcCompile` resources with BDS `BRCC32.exe` before DCC so clean projects no longer require a prior IDE build.
- Add automatic `rsvars.bat` and BRCC32 discovery with optional path overrides, resource-stage cancellation, build-plan details, and explicit warnings for unsupported project resource cases.

## 0.2.7

- Point the Marketplace repository and issue links to the public GitHub repository.

## 0.2.6

- Rename the public extension brand to Delphi DCC Builder, add the XE7 version selector, and move version-specific BDS/DCC mappings into documented JSON configuration files.
- Set the extension author to Alex Niu and use the existing 1847bell Marketplace publisher.

## 0.2.5

- Keep up to 10 recently selected `.dproj` files per workspace while retaining keyword search across all workspace projects.
- Keep both the previous and new output paths after a successful change and isolate history by normalized `.dproj` path.
- Add `delphiXe7.outputPathHistoryLimit`, defaulting to 5 entries per project with a supported range of 1-15.

## 0.2.4

- Add an Explorer context command for changing the selected configuration and platform's `DCC_ExeOutput`.
- Prefill the effective output path, retain the 10 most recent entries, and save the selected value back to the `.dproj`.
- Use `Build for Win32/Win64` command titles and keep Rebuild as a Command Palette-only recovery action.

## 0.2.3

- Rename the extension and its user-facing labels to Delphi DCC Builder while preserving existing command and setting identifiers.
- Add an optional DCC64 compiler path and a Win64 Explorer build command that is visible only when the path is configured.
- Evaluate Win64 dproj conditions and read the BDS 15.0 Win64 Library and Debug DCU paths for DCC64 builds.

## 0.2.2

- Match the Delphi XE7 ResourcePath construction and always emit an explicit `-R` argument.
- Include translated resources, BRCC output, project unit/resource paths, and the BDS Win32 Library Path in resource lookup.
- Fix missing VCL and FireDAC resources such as `Controls.res`, `midas.res`, and `FireDAC.VCLUI.Login.dfm` when `dcc32.cfg` is disabled.

## 0.2.1

- Match the Delphi XE7 DCC task mappings for debug information, symbol references, and optimization.
- Treat `DCC_DebugDCUs` as a Debug DCU search-path setting instead of emitting `-V`.
- Read the BDS 15.0 Win32 Debug DCU Path and prepend it when Debug DCUs are enabled.
- Pass `--no-config` on every build so `dcc32.cfg` cannot silently alter the Build Plan.

## 0.2.0

- Require an explicit `delphiXe7.compilerPath` before building or showing a Build Plan.
- Remove the default project and default configuration settings.
- Read configurations from the selected `.dproj` and prompt for the exact configuration to build.
- Keep Rebuild in the Command Palette while removing it from the Explorer context menu.
- Hide Show Build Plan in the Explorer context menu by default, controlled by `delphiXe7.showBuildPlanMenu`.

## 0.1.4

- Clear completed builds from the status bar immediately instead of waiting for the success notification to be dismissed.

## 0.1.3

- Match XE7/MSBuild include lookup by passing the complete unit and BDS library search path to `-I` as well as `-U`.
- Parse global compiler diagnostics that are concatenated with DCC32 carriage-return progress text.

## 0.1.2

- Match XE7/MSBuild runtime-package behavior by emitting `-LU` only when `UsePackages` or `DCC_EnabledPackages` is enabled.
- Report compiler errors without a source location, such as `Fatal: E2202`, against the project file.

## 0.1.1

- Fixed recursive expansion of undefined self-referencing DCC properties that could cause `spawn ENAMETOOLONG` on real XE7 projects.

## 0.1.0

- Initial Delphi XE7 Win32 Build Plan, DCC32 runner, cancellation, and diagnostics support.
