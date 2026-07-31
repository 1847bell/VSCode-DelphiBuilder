# Delphi XE7 Build

Build Delphi XE7 Win32 projects from Visual Studio Code by invoking `DCC32.exe` directly.

## Commands

- `Delphi XE7: Build Project...`
- `Delphi XE7: Rebuild Project`
- `Delphi XE7: Cancel Build`
- `Delphi XE7: Show Build Plan`

`delphiXe7.compilerPath` is required. Right-click a `.dproj` and select **Build Project...**; the extension reads the project and prompts for one of its declared configurations. Rebuild remains available from the Command Palette. **Show Build Plan** is always available from the Command Palette and can be enabled in the Explorer context menu with `delphiXe7.showBuildPlanMenu`.

## Current scope

- Windows, Delphi XE7/BDS 15.0, DCC32 and Win32 only
- `.dproj` projects whose build can be represented by direct DCC32 arguments
- Debug, Release and project-defined configurations

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
