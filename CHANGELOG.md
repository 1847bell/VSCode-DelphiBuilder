# Change Log

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
