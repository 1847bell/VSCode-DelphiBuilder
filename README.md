# Delphi XE7 DCC Builder

Build Delphi XE7 Win32 and Win64 projects from Visual Studio Code by invoking `DCC32.exe` or `DCC64.exe` directly.

Current version: `0.2.5`

## Commands

- `Delphi DCC Builder: Build for Win32`
- `Delphi DCC Builder: Build for Win64`
- `Delphi DCC Builder: Rebuild for Win32`
- `Delphi DCC Builder: Cancel Build`
- `Delphi DCC Builder: Change Output Path`
- `Delphi DCC Builder: Show Build Plan`

`delphiXe7.compilerPath` is required for Win32. `delphiXe7.compiler64Path` is optional; when it is non-empty, the `.dproj` Explorer context menu includes **Build for Win64**. Each build reads the project and prompts for one of its declared configurations. Rebuild remains available for Win32 from the Command Palette. **Show Build Plan** is always available from the Command Palette and can be enabled in the Explorer context menu with `delphiXe7.showBuildPlanMenu`.

Right-click a `.dproj` and select **Change Output Path** to edit the effective `DCC_ExeOutput`. The current value is prefilled, and both the previous and new values are retained after a successful change. History is isolated by the normalized full `.dproj` path and limited by `delphiXe7.outputPathHistoryLimit` (default `5`, range `1`-`15`). The selected path is saved as an override for the chosen configuration and platform, so changing `Release|Win32` does not change another configuration or platform.

## Current scope

- Windows, Delphi XE7/BDS 15.0, DCC32/Win32 and optional DCC64/Win64
- `.dproj` projects whose build can be represented by direct DCC arguments
- Debug, Release and project-defined configurations
- Platform-specific BDS 15.0 Library Path and Debug DCU Path expansion

Imported MSBuild targets and build events are not executed. Unsupported project properties are reported in the Build Plan warnings so they are not silently ignored.

## Development

```powershell
npm install
npm test
npm run check
npm run compile
npm run package
```

Press `F5` in VS Code to launch an Extension Development Host.
