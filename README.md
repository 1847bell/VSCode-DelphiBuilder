# Delphi DCC Builder

Build Delphi projects directly from Visual Studio Code with the Delphi command-line compilers. The extension evaluates `.dproj` configuration values, prepares a visible Build Plan, runs `DCC32.exe` or `DCC64.exe`, and publishes compiler diagnostics to the Problems panel.

Links: [Repository](https://github.com/1847bell/VSCode-DelphiBuilder) · [Issues and feature requests](https://github.com/1847bell/VSCode-DelphiBuilder/issues) · [中文说明](README_CN.md)

## Features

- Build Win32 projects with `DCC32.exe` and optionally build Win64 projects with `DCC64.exe`.
- Read the configurations declared by a `.dproj` and build the selected configuration and platform.
- Maintain Delphi project groups in a dedicated Activity Bar view.
- Add `.dproj` files from the Explorer context menu, move projects between groups, or remove them from a group without deleting project files.
- Reorder or sort groups, rename groups, and refresh the project view.
- Select the active configuration for each grouped project and start Win32 or Win64 builds from the project tree.
- Build, Rebuild, Cancel Build, Show Build Plan, and Change Output Path commands.
- Keep output-path history per project, with configuration and platform-specific overrides.
- Show the exact compiler path, working directory, arguments, resource steps, warnings, and expected artifacts in the Build Plan.
- Decode DCC output using the system code page, CP936, or UTF-8 and publish source locations to Problems.
- Prepare resources before DCC:
  - Compile `.dproj` `RcCompile` items with the BDS `BRCC32.exe`.
  - Create a minimal project `.res` when the main source contains `{$R *.res}` and the file is missing.
  - Never overwrite an existing project `.res`.
  - Report `RcItem` project resources as a warning because direct DCC mode does not reproduce the complete MSBuild resource merge.
- Discover `rsvars.bat` and `BRCC32.exe` automatically, with explicit path overrides when an installation is non-standard.
- Use `--no-config` so the Build Plan is not silently changed by a compiler `.cfg` file.
- Localize the extension UI and its custom settings page in English or Simplified Chinese.

## Support status

The only compiler version currently implemented and tested on real hardware is **Delphi XE7 / BDS 15.0** on Windows. The test suite covers XE7 Win32, XE7 Win64, resource preprocessing, diagnostics, and the project sidebar. Other Delphi versions are not claimed to be compatible just because their DCC command line looks similar.

If you need another Delphi version, please add the corresponding version configuration and tests, then submit the files through [GitHub Issues](https://github.com/1847bell/VSCode-DelphiBuilder/issues) or a pull request. Include the compiler version, BDS directory layout, registry values, Build Plan, and real compiler test results.

## Installation and first build

1. Install the VSIX from the Marketplace or from a locally built `.vsix` file.
2. Open a workspace containing a `.dproj`.
3. Open **Delphi DCC Builder: Settings** from the Delphi Activity Bar, or edit workspace settings directly.
4. Set the required Win32 compiler path:

   ```json
   {
     "delphiDcc.version": "XE7",
     "delphiXe7.compilerPath": "D:\\Program Files (x86)\\Embarcadero\\Studio\\15.0\\bin\\DCC32.exe"
   }
   ```

5. Optionally set `delphiXe7.compiler64Path` for Win64. Leave `delphiXe7.rsvarsPath` and `delphiXe7.brcc32Path` empty to use automatic discovery.
6. Create a project group, add one or more `.dproj` files, choose the active configuration, and select **Build Win32** or **Build Win64** from the project tree.

The Explorer context menu can also add a `.dproj` to the selected project group and start a build. **Show Build Plan** is available from the Command Palette and can be added to the Explorer menu with `delphiXe7.showBuildPlanMenu`.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `delphiDcc.language` | `en` | Extension UI language: `en` or `zh-cn`. |
| `delphiDcc.version` | `XE7` | Selects the version configuration used by the Build Plan. |
| `delphiDcc.resourceBuild` | `true` | Prepare missing project resources and compile `RcCompile` resources. |
| `delphiXe7.compilerPath` | empty | Required absolute path to `DCC32.exe`. |
| `delphiXe7.compiler64Path` | empty | Optional absolute path to `DCC64.exe`. |
| `delphiXe7.rsvarsPath` | empty | Optional absolute path to `rsvars.bat`; empty means auto-discover. |
| `delphiXe7.brcc32Path` | empty | Optional absolute path to `BRCC32.exe`; empty means auto-discover. |
| `delphiXe7.showBuildPlanMenu` | `hide` | Set to `show` to add Show Build Plan to Explorer. |
| `delphiXe7.outputPathHistoryLimit` | `5` | Per-project output path history, from `1` to `15`. |
| `delphiXe7.outputEncoding` | `system` | DCC output decoding: `system`, `cp936`, or `utf8`. |
| `delphiXe7.additionalArguments` | `[]` | Extra DCC arguments inserted before the main source file. |
| `delphiXe7.environment` | `{}` | Environment variables applied after the selected BDS environment. |

Imported MSBuild targets, custom targets, pre-build events, and post-build events are not executed by direct DCC mode. Unsupported properties are shown as Build Plan warnings instead of being silently ignored.

## Add a Delphi compiler version

Version support is data-driven, but the VS Code manifest is static. Adding a JSON file alone is not enough.

1. Copy `delphi-versions/XE7.json` to `delphi-versions/<Version>.json`.
2. Update the new file's `version`, `displayName`, BDS registry version, Studio directory version, settings section, compiler setting names, compiler file names, DCC switches, argument rules, and recognized metadata.
3. Validate the file against `delphi-versions/schema.json`. Keep the `$schema` reference and use a unique `version`.
4. Add the new version to `package.json` under `delphiDcc.version.enum` and add its display label to `enumItemLabels`.
5. Register the version's compiler settings in `package.json`, `package.nls.json`, and `package.nls.zh-cn.json`. Add corresponding entries to `src/vscode/settingsPage.ts` so the custom settings page can edit them.
6. Update static menu conditions when a new version uses different setting names. The Explorer menu cannot discover arbitrary settings dynamically.
7. Add unit tests for version loading, the manifest, BDS discovery, DCC argument ordering, and Build Plan generation.
8. Add a real compiler integration test for Win32, Win64 when available, Debug, Release, Rebuild, resources, and diagnostics.
9. Run `npm run check`, `npm test`, `npm run test:xe7` (or the matching integration command), `npm run compile`, and `npm run package`.

The complete schema and contributor checklist are in [DELPHI_VERSION_CONFIGURATION.md](docs/DELPHI_VERSION_CONFIGURATION.md). When requesting help for a new compiler, attach the JSON configuration, tests, and the generated Build Plan to an [Issue](https://github.com/1847bell/VSCode-DelphiBuilder/issues).

## Add another language

The extension has two localization layers: `package.nls*.json` localizes the VS Code manifest, while `src/localization/locales/*.json` localizes runtime UI, Output messages, diagnostics, and the custom settings page.

To add a language such as `fr`:

1. Copy `src/localization/locales/en.json` to `src/localization/locales/fr.json` and translate every key. Keep the keys and placeholders such as `{project}` and `{configuration}` unchanged.
2. Extend `ExtensionLanguage`, the `messages` map, and `resolveLanguage` in `src/localization/localizer.ts`.
3. Add `fr` and a `%language.french%` label to `package.json` under `delphiDcc.language`.
4. Add the manifest label and translated manifest descriptions to `package.nls.json` and `package.nls.fr.json`.
5. Add language options and labels to `src/vscode/settingsPage.ts` and the new locale file.
6. Add or update localization tests. The English locale is the fallback for missing keys, but complete translations are required before release.
7. Add a translated README (for example `README_FR.md`) if a translated Marketplace companion is desired. Marketplace still renders only `README.md`; link the additional README manually.
8. Run the full check, test, compile, and package commands and inspect the VSIX contents.

Do not rename existing message keys without updating both runtime locale files and their tests. The VS Code Settings view itself follows the host VS Code display language; the `delphiDcc.language` setting controls the extension UI and custom settings page.

## Development and verification

```powershell
npm install
npm run check
npm test
npm run test:xe7
npm run compile
npm run package
```

`npm run package` creates a VSIX containing the manifest, README files, localized manifest files, version JSON files, documentation, and the bundled extension. The package command may report a missing LICENSE file; this is packaging metadata and does not change the build behavior.
