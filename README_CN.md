# Delphi DCC Builder

在 Visual Studio Code 中直接调用 Delphi 命令行编译器编译项目。扩展会读取 `.dproj` 配置，生成可查看的 Build Plan，运行 `DCC32.exe` 或 `DCC64.exe`，并将编译诊断发布到 Problems 面板。

链接：[代码仓库](https://github.com/1847bell/VSCode-DelphiBuilder) · [问题与功能请求](https://github.com/1847bell/VSCode-DelphiBuilder/issues) · [English README](README.md)

## 主要功能

- 使用 `DCC32.exe` 编译 Win32；配置 `DCC64.exe` 后可编译 Win64。
- 读取 `.dproj` 声明的配置，并编译选定的配置和平台。
- 在 Activity Bar 中维护 Delphi 项目分组。
- 从资源管理器右键菜单添加 `.dproj`，支持在分组之间移动项目，或从分组中移除项目而不删除项目文件。
- 支持分组排序、上移、下移、重命名和刷新。
- 为分组项目选择当前配置，并直接从项目树启动 Win32 或 Win64 编译。
- 提供编译、重新编译、取消编译、查看编译计划和修改输出路径命令。
- 按项目保存输出路径历史，并为不同配置和平台保存独立覆盖值。
- 在 Build Plan 中显示编译器路径、工作目录、参数、资源步骤、警告和预期产物。
- 支持系统编码、CP936、UTF-8 解码 DCC 输出，并将源文件位置发布到 Problems 面板。
- 在 DCC 前处理资源：
  - 使用 BDS 的 `BRCC32.exe` 编译 `.dproj` 中的 `RcCompile` 项。
  - 主源包含 `{$R *.res}` 且同名项目资源缺失时，创建最小有效 `.res`。
  - 绝不覆盖已有项目 `.res`。
  - `RcItem` 项目资源无法由直接 DCC 流程完整模拟，会在 Build Plan 中给出警告。
- 自动发现 `rsvars.bat` 和 `BRCC32.exe`，非标准安装也可以显式配置路径。
- 固定使用 `--no-config`，避免编译器 `.cfg` 文件静默改变 Build Plan。
- 扩展界面和自定义设置页支持 English 与简体中文。

## 支持范围与测试状态

当前唯一实现并在真实机器上测试过的编译器是 **Delphi XE7 / BDS 15.0**，运行环境为 Windows。测试覆盖 XE7 Win32、XE7 Win64、资源预处理、诊断和项目侧边栏。其他 Delphi 版本即使命令行参数相似，也不代表已经兼容。

如果需要其他 Delphi 版本，请增加对应的版本配置文件和测试，并通过 [GitHub Issues](https://github.com/1847bell/VSCode-DelphiBuilder/issues) 或 Pull Request 提交。请附上编译器版本、BDS 目录结构、注册表值、Build Plan 和真实编译测试结果。

## 安装与第一次编译

1. 从 Marketplace 安装，或安装本地生成的 `.vsix`。
2. 打开包含 `.dproj` 的工作区。
3. 在 Delphi Activity Bar 中打开 **Delphi DCC Builder: 设置**，也可以直接编辑工作区设置。
4. 配置必填的 Win32 编译器路径：

   ```json
   {
     "delphiDcc.version": "XE7",
     "delphiXe7.compilerPath": "D:\\Program Files (x86)\\Embarcadero\\Studio\\15.0\\bin\\DCC32.exe"
   }
   ```

5. 如需 Win64，配置 `delphiXe7.compiler64Path`。`delphiXe7.rsvarsPath` 和 `delphiXe7.brcc32Path` 留空时会自动发现。
6. 创建项目分组，添加一个或多个 `.dproj`，选择当前配置，然后在项目树中选择 **编译 Win32** 或 **编译 Win64**。

也可以在资源管理器右键菜单中将 `.dproj` 添加到当前项目分组并启动编译。**查看编译计划**始终可以从命令面板打开；设置 `delphiXe7.showBuildPlanMenu` 为 `show` 后，也会出现在资源管理器菜单中。

## 设置项

| 设置 | 默认值 | 作用 |
| --- | --- | --- |
| `delphiDcc.language` | `en` | 扩展界面语言：`en` 或 `zh-cn`。 |
| `delphiDcc.version` | `XE7` | 选择 Build Plan 使用的版本配置。 |
| `delphiDcc.resourceBuild` | `true` | 准备缺失的项目资源并编译 `RcCompile` 资源。 |
| `delphiXe7.compilerPath` | 空 | `DCC32.exe` 的必填绝对路径。 |
| `delphiXe7.compiler64Path` | 空 | `DCC64.exe` 的可选绝对路径。 |
| `delphiXe7.rsvarsPath` | 空 | `rsvars.bat` 的可选绝对路径；为空时自动发现。 |
| `delphiXe7.brcc32Path` | 空 | `BRCC32.exe` 的可选绝对路径；为空时自动发现。 |
| `delphiXe7.showBuildPlanMenu` | `hide` | 设为 `show` 后在资源管理器显示查看编译计划。 |
| `delphiXe7.outputPathHistoryLimit` | `5` | 每个项目保存的输出路径历史，范围 `1` 到 `15`。 |
| `delphiXe7.outputEncoding` | `system` | DCC 输出编码：`system`、`cp936` 或 `utf8`。 |
| `delphiXe7.additionalArguments` | `[]` | 插入主源文件前的额外 DCC 参数。 |
| `delphiXe7.environment` | `{}` | 在选定 BDS 环境之后应用的环境变量。 |

直接 DCC 模式不会执行导入的 MSBuild targets、自定义 targets、编译前事件或编译后事件。不支持的属性会在 Build Plan 中显示警告，不会被静默忽略。

## 如何添加不同版本的编译器配置文件

版本支持由 JSON 驱动，但 VS Code 清单是静态的，只添加 JSON 文件并不完整。

1. 将 `delphi-versions/XE7.json` 复制为 `delphi-versions/<Version>.json`。
2. 修改新文件的 `version`、`displayName`、BDS 注册表版本、Studio 目录版本、设置区段、编译器设置名、编译器文件名、DCC 开关、参数规则和已识别元数据。
3. 用 `delphi-versions/schema.json` 校验文件。保留 `$schema`，并确保 `version` 唯一。
4. 在 `package.json` 的 `delphiDcc.version.enum` 中加入新版本，并在 `enumItemLabels` 中加入显示名称。
5. 在 `package.json`、`package.nls.json` 和 `package.nls.zh-cn.json` 中注册该版本的编译器设置；在 `src/vscode/settingsPage.ts` 中加入对应项，确保自定义设置页可以编辑。
6. 如果新版本使用不同的设置名，更新静态资源管理器菜单条件。菜单不能动态发现任意设置。
7. 增加版本加载、清单、BDS 定位、DCC 参数顺序和 Build Plan 的单元测试。
8. 增加真实编译器集成测试，覆盖 Win32、可用时的 Win64、Debug、Release、Rebuild、资源和诊断。
9. 执行 `npm run check`、`npm test`、对应的真实集成测试、`npm run compile` 和 `npm run package`。

完整字段说明和贡献者检查表见 [DELPHI_VERSION_CONFIGURATION.md](docs/DELPHI_VERSION_CONFIGURATION.md)。需要协助支持新编译器时，请将 JSON 配置、测试和生成的 Build Plan 附加到 [Issue](https://github.com/1847bell/VSCode-DelphiBuilder/issues)。

## 如何添加多语言支持

扩展有两层本地化：`package.nls*.json` 负责 VS Code 清单；`src/localization/locales/*.json` 负责运行时界面、Output、诊断信息和自定义设置页。

以添加法语 `fr` 为例：

1. 将 `src/localization/locales/en.json` 复制为 `src/localization/locales/fr.json`，翻译全部键值。保留 `{project}`、`{configuration}` 等占位符。
2. 在 `src/localization/localizer.ts` 中扩展 `ExtensionLanguage`、`messages` 映射和 `resolveLanguage`。
3. 在 `package.json` 的 `delphiDcc.language` 中加入 `fr` 以及 `%language.french%` 标签。
4. 在 `package.nls.json` 和新的 `package.nls.fr.json` 中加入清单标签和描述翻译。
5. 在 `src/vscode/settingsPage.ts` 和新语言文件中加入语言选项及标签。
6. 增加或更新本地化测试。缺失键会回退到英文，但发布前必须完成完整翻译。
7. 如果希望提供中文以外的说明书，增加例如 `README_FR.md`；Marketplace 仍只渲染 `README.md`，需要在 README 中手动链接其他语言文件。
8. 执行完整的检查、测试、编译和打包，并检查 VSIX 内容。

不要直接重命名已有消息键；运行时的两个语言文件和测试必须同步更新。VS Code 原生设置页跟随 VS Code 显示语言；`delphiDcc.language` 控制扩展界面和自定义设置页。

## 开发与验证

```powershell
npm install
npm run check
npm test
npm run test:xe7
npm run compile
npm run package
```

`npm run package` 会生成 VSIX，包含清单、README、清单本地化文件、版本 JSON、文档和打包后的扩展。打包时如果提示缺少 LICENSE，这是发布元数据提示，不会改变编译功能。
