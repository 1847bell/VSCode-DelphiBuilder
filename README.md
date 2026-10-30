# Delphi DCC Builder

Build Delphi projects directly from Visual Studio Code with the Delphi command-line compilers. The extension evaluates `.dproj` configuration values, prepares a visible Build Plan, runs `DCC32.exe` or `DCC64.exe`, and publishes compiler diagnostics to the Problems panel.

Links: [Repository](https://github.com/1847bell/VSCode-DelphiBuilder) · [Issues and feature requests](https://github.com/1847bell/VSCode-DelphiBuilder/issues) · [Delphi version configuration guide](docs/DELPHI_VERSION_CONFIGURATION.md) · [中文说明](README_CN.md)

## Independent MCP branch

**`mcp-only` is a permanent, independent MCP development branch. It must not be merged into `main`; future work on this branch is limited to MCP functionality.** The existing VS Code extension is retained without feature changes. The MCP server reuses its Delphi core and runs without VS Code.

### Setup

Requires Windows, Node.js 22 or later, and a working local Delphi XE7/BDS 15.0 installation.

```powershell
npm ci
npm run compile:mcp
Copy-Item mcp.config.example.json mcp.config.json
# Set trusted roots and compiler paths in mcp.config.json
```

Configure your MCP client to launch the server directly, using absolute paths:

```json
{
  "mcpServers": {
    "delphi-builder": {
      "command": "node",
      "args": [
        "D:/OthCode/DelphiBuilder/dist/mcp.js",
        "--config",
        "D:/OthCode/DelphiBuilder/mcp.config.json"
      ]
    }
  }
}
```

The transport is stdio. Launching the server manually and seeing it wait for input is normal. Clients should launch Node directly rather than npm, whose startup output may interfere with the protocol. `npm run start:mcp -- --config <absolute-config-path>` is available for manual use.

Use `mcp.config.example.json` as the configuration template. `roots` must contain existing trusted project directories. Configuration-relative roots and executable paths resolve against the configuration file, not the process working directory. Tool-relative `projectFile` paths resolve against the first root; relative output paths resolve against the `.dproj` directory. Output edits preserve resolvable expressions such as `$(Config)` and `$(Platform)`.

`compilerPath` configures Win32; optional `compiler64Path` configures Win64. Project inspection does not require a compiler path. Other settings are `version` (default `XE7`), `resourceBuild` (default `true`), `outputEncoding` (`system`, `cp936`, `utf8`), optional `rsvarsPath` and `brcc32Path`, `additionalArguments`, and `environment`. Compiler paths, arguments and environment overrides come only from the trusted local configuration, never from tool arguments. Local `mcp.config.json` is ignored by Git.

### Tools

| Tool | Behavior |
| --- | --- |
| `get_project_info` | Inspect configurations, selected configuration/platform, main source, effective output directory, version, resources and warnings. |
| `get_build_plan` | Return a build plan without writing files or compiling; inherited environment values are omitted. |
| `start_build` | Start an asynchronous build; pass `rebuild: true` to rebuild. Returns a `jobId`. |
| `get_build_status` | Read state, paginated logs, process result, structured diagnostics and expected/existing artifacts. |
| `cancel_build` | Request cancellation; query status until terminal. |
| `set_output_path` | Persist `DCC_ExeOutput` for one explicit configuration/platform. |
| `set_project_version` | Persist file/product version for one explicit configuration/platform; 1–4 numeric components, each 0–65535. |

Project tools accept `projectFile`. Inspection/build tools default to the `.dproj` configuration and `Win32` when omitted. Mutation tools require explicit `configuration` and `platform`, plus `outputPath` or `version` respectively.

For example, call `start_build` with `{"projectFile":"App/App.dproj","configuration":"Release","platform":"Win64","rebuild":true}`. Query `get_build_status` with `{"jobId":"returned-id","offset":0,"limit":16384}` and continue with `nextOffset`. Logs use UTF-16 code-unit offsets, with a maximum page size of 65536. Drain pages until the state is terminal and `nextOffset === totalLength`. States are `queued`, `running`, `succeeded`, `failed`, and `cancelled`. Diagnostics include file, line/column when available, severity, compiler code and message. Preparation errors also expose `error`. Invalid tool operations return MCP `isError`; compiler failures are reported through job state.

### Safety and lifecycle

- Builds and edits are mutually exclusive per project; different projects can build concurrently. Project inspection remains available during builds.
- Project mutations require valid UTF-8, preserve BOM/newlines, and compare original bytes before writing. Save editor changes before calling MCP; unsaved VS Code/IDE buffers are not visible to this process.
- Builds write artifacts and may create/update project `.res` files. They never automatically execute the resulting program. Main source, resource input/output and recognized artifact/output paths must remain within configured roots; known symlink escapes are rejected. External library search paths remain supported.
- Root checks are not an OS sandbox. Only allow trusted projects/compiler configuration; malicious source, filesystem races and arbitrary compiler behavior are not isolated.
- Jobs are process-local. The latest 50 completed jobs are retained; restarting invalidates IDs. Closing stdin or sending an exit signal cancels active builds and waits for cleanup.
- Deploy `dist/mcp.js` together with installed npm dependencies and the project's `delphi-versions/` directory. No VSIX, VS Code settings, project groups or editor history are required.

Development checks: `npm run check`, `npm test`, `npm run compile:mcp`. See [中文 MCP 说明](README_CN.md#mcp-独立开发分支) for the full Chinese setup. The original extension documentation follows below.

## Features

- Build Win32 projects with `DCC32.exe` and optionally build Win64 projects with `DCC64.exe`.
- Read the configurations declared by a `.dproj` and build the selected configuration and platform.
- Maintain Delphi project groups in a dedicated Activity Bar view.
- Add `.dproj` files from the Explorer context menu, reorder projects within a group, move projects between groups, or remove them from a group without deleting project files.
- Automatically sort groups by name, move groups up or down manually, rename groups, and refresh the project view.
- Select the active configuration for each grouped project and start Win32 or Win64 builds from the project tree.
- Use the Reveal Project Location button on a project row to jump to the Explorer view with the `.dproj` file selected.
- Build, Rebuild, Cancel Build, Show Build Plan, and Change Output Path commands.
- Keep output-path history per project, with configuration and platform-specific overrides.
- Edit project version numbers for a specific configuration and platform, and synchronize version information into the compiled EXE or DLL.
- Show the exact compiler path, working directory, arguments, resource steps, warnings, and expected artifacts in the Build Plan.
- Decode DCC output using the system code page, CP936, or UTF-8 and publish source locations to Problems.
- Prepare resources before DCC:
  - Compile `.dproj` `RcCompile` items with the BDS `BRCC32.exe`.
  - Create a minimal project `.res` when the main source contains `{$R *.res}` and the file is missing.
  - Update version information in an existing project `.res` while preserving icons and other non-version resources.
  - Report `RcItem` project resources as a warning because direct DCC mode does not reproduce the complete MSBuild resource merge.
- Discover `rsvars.bat` and `BRCC32.exe` automatically, with explicit path overrides when an installation is non-standard.
- Use `--no-config` so the Build Plan is not silently changed by a compiler `.cfg` file.
- Localize the extension UI and its custom settings page in English or Simplified Chinese.

## Support status

The only compiler version currently implemented and tested on real hardware is **Delphi XE7 / BDS 15.0** on Windows. The test suite covers XE7 Win32, XE7 Win64, resource preprocessing, diagnostics, and the project sidebar. Other Delphi versions are not claimed to be compatible just because their DCC command line looks similar.

If you need another Delphi version and can implement the support, clone the repository, create a branch named for that compiler version (for example, `version-xe8`), add the configuration and tests, and open a pull request after the tests pass. If you need assistance, attach the JSON configuration, tests, and generated Build Plan to an [Issue](https://github.com/1847bell/VSCode-DelphiBuilder/issues). Include the compiler version, BDS directory layout, registry values, and real compiler test results when available.

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

## Changing a project version number

1. In the Delphi Projects view, expand a project and select its active configuration, such as `Debug` or `Release`.
2. Select **Change Version Number** below **Change Output Path**. You can also run **Delphi DCC Builder: Change Version Number** from the Command Palette and select a project and configuration when prompted.
3. Check the configuration and platform shown in the input prompt, enter 1 to 4 numeric components separated by dots (for example, `1.2.3.4`), and press Enter to save the change to the `.dproj` file. The project tree action targets the active configuration on **Win32**.

The editor starts with the effective `FileVersion` for that configuration and platform, taking inherited settings into account. It falls back to `ProductVersion`, numeric version fields, or `1.0.0.0` when no version is defined. Saving updates both `FileVersion` and `ProductVersion` and the numeric version fields in the existing configuration/platform property group; a scoped group is added if needed. Other configurations and platforms keep their version settings, and unrelated project settings are preserved.

On the next build, with `delphiDcc.resourceBuild` enabled (the default) and `{$R *.res}` in the main source, the extension synchronizes the effective `.dproj` version information into the project `.res` before DCC runs. The compiled EXE or DLL then includes the updated file and product versions, while icons and other non-version resources are preserved.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `delphiDcc.language` | `en` | Extension UI language: `en` or `zh-cn`. |
| `delphiDcc.version` | `XE7` | Selects the version configuration used by the Build Plan. |
| `delphiDcc.resourceBuild` | `true` | Prepare missing project resources, synchronize project version information, and compile `RcCompile` resources. |
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

The complete schema and contributor checklist are available from the version configuration guide in the links above.

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
