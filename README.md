# Delphi XE7 Build

Build Delphi XE7 Win32 projects from Visual Studio Code by invoking `DCC32.exe` directly.

## Commands

- `Delphi XE7: Build Project`
- `Delphi XE7: Rebuild Project`
- `Delphi XE7: Cancel Build`
- `Delphi XE7: Show Build Plan`

The extension discovers BDS 15.0 through the Windows registry unless `delphiXe7.compilerPath` is set. Use **Show Build Plan** before the first build to verify the compiler, working directory, configuration, search paths, output directories, and command arguments.

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
