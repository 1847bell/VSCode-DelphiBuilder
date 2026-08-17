# Delphi DCC Builder

通过 Visual Studio Code 直接调用 `DCC32.exe` 或 `DCC64.exe` 编译 Delphi Win32 和 Win64 项目。目前支持 Delphi XE7，并已将特定版本的构建配置独立出来，便于后续支持其他编译器版本。

当前版本：`0.2.9`

## 命令

- `Delphi DCC Builder: Build for Win32`
- `Delphi DCC Builder: Build for Win64`
- `Delphi DCC Builder: Rebuild for Win32`
- `Delphi DCC Builder: Cancel Build`
- `Delphi DCC Builder: Change Output Path`
- `Delphi DCC Builder: Show Build Plan`

通过 `delphiDcc.version` 选择 Delphi 编译器版本，目前只有 `XE7`。Win32 编译必须设置 `delphiXe7.compilerPath`。`delphiXe7.compiler64Path` 为可选项；设置非空后，`.dproj` 资源管理器右键菜单会显示 **Build for Win64**。每次编译都会读取项目，并提示选择项目中声明的配置。Win32 Rebuild 仍可从命令面板执行。**Show Build Plan** 始终可从命令面板执行，也可以通过 `delphiXe7.showBuildPlanMenu` 将其加入资源管理器右键菜单。

资源预处理由 `delphiDcc.resourceBuild` 控制。项目包含 `.dproj` `RcCompile` 项时，扩展会在 DCC 前调用 `BRCC32.exe` 生成 `.res`。主 `.dpr` 或 `.dpk` 包含 `{$R *.res}` 且对应项目 `.res` 缺失时，扩展会在 DCC 前创建最小有效项目资源，并且绝不会覆盖已有文件。`delphiXe7.rsvarsPath` 和 `delphiXe7.brcc32Path` 是 BRCC32 自动发现的可选覆盖路径。项目级 `RcItem` 生成目前不会模拟，遇到时会在 Build Plan 中给出警告。

当工作区中包含多个 `.dproj` 文件时，项目选择列表会优先显示当前工作区最近使用的最多 10 个项目。没有历史记录的工作区初始显示空列表；输入关键字后，仍会搜索当前打开工作区中的全部 `.dproj` 文件。

右键 `.dproj` 并选择 **Change Output Path**，即可编辑有效的 `DCC_ExeOutput`。输入框会预填当前值，修改成功后，修改前后的值都会保留。历史记录按规范化后的 `.dproj` 完整路径隔离，并由 `delphiXe7.outputPathHistoryLimit` 限制（默认 `5`，范围 `1`-`15`）。选中的路径会保存为指定配置和平台的覆盖值，因此修改 `Release|Win32` 不会影响其他配置或平台。

## 当前支持范围

- Windows、Delphi XE7/BDS 15.0、DCC32/Win32，以及可选的 DCC64/Win64
- 构建过程可以直接表示为 DCC 参数的 `.dproj` 项目
- Debug、Release 和项目自定义配置
- 按平台展开 BDS 15.0 Library Path 和 Debug DCU Path

不会执行导入的 MSBuild targets 和构建事件。资源预处理仅覆盖缺失的通配符项目资源和 `RcCompile` 项；其中 `RcCompile` 会直接调用 BDS `BRCC32.exe`，并使用展开后的 BRCC/DCC Define、Include Path、Code Page、Language、Suffix 和输出目录。不支持的项目属性会在 Build Plan 警告中报告，不会被静默忽略。

## Delphi 版本配置

特定版本的 BDS 元数据和 DCC 命令映射以可读的 JSON 文件保存在 `delphi-versions/` 中。目前的实现是 `delphi-versions/XE7.json`，`delphi-versions/schema.json` 用于说明和校验配置格式。

每个版本配置文件定义：

- BDS 注册表版本和 Studio 目录版本
- Win32/Win64 编译器文件名和 VS Code 设置名称
- 基础参数和 Rebuild 参数
- 特殊搜索路径和运行时包开关
- `.dproj` 值属性和路径属性的映射
- 有顺序的布尔参数和枚举参数规则
- 已识别的 DCC 元数据属性

`dcc.argumentRules` 的顺序就是生成 DCC 参数的顺序。某个值对应空数组时，表示有意不生成该参数。

新增 Delphi 版本时，复制 `XE7.json`，修改其中的版本、BDS 信息和 DCC 映射，然后在 `package.json` 的 `delphiDcc.version` `enum` 和 `enumItemLabels` 中增加该版本。根据 `settingsSection` 和 `compilerSettingNames` 添加对应的编译器路径设置。运行时会自动发现 `delphi-versions/` 下除 `schema.json` 以外的所有 JSON 文件；只有当某个编译器需要的行为无法用现有配置 Schema 表示时，才需要修改 TypeScript。正式声明支持新版本前，应增加单元测试和真实编译器集成测试。

完整的字段说明、新增步骤、参数顺序、VS Code 清单注册、测试、打包和故障排查请参阅 `docs/DELPHI_VERSION_CONFIGURATION.md`（Delphi 版本配置文件开发手册）。

## 开发

```powershell
npm install
npm test
npm run check
npm run compile
npm run package
```
