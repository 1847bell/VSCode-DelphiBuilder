# Delphi DCC Builder

通过 Visual Studio Code 直接调用 `DCC32.exe` 或 `DCC64.exe` 编译 Delphi Win32、Win64 项目。目前支持 Delphi XE7，并已将版本配置与通用构建流程分离，便于后续扩展其他版本。

当前版本：`0.2.6`

## 功能

- 从 `.dproj` 自动定位对应的 `.dpr` 或 `.dpk`
- 支持 Debug、Release 和项目自定义配置
- 支持 Build、Rebuild 和取消编译
- 按平台读取 BDS 15.0、XE7 环境变量、Library Path 和 Debug DCU Path
- 生成可查看、可序列化的 Build Plan
- 将 Error、Fatal、Warning 和 Hint 发布到 VS Code Problems 面板
- 支持点击诊断跳转到对应源码行
- 支持系统代码页、CP936/GBK 和 UTF-8 编译输出
- 支持中文路径和包含空格的路径
- 可从 `.dproj` 右键菜单按配置和平台修改产物路径，并选择最近输入记录
- 每次编译固定使用 `--no-config`，防止 `.cfg` 隐式改变 Build Plan
- 按 XE7 Targets 生成完整 `-R`，支持 VCL、FireDAC 的 `.res/.dfm` 资源查找

## 安装

使用 VS Code 命令行安装打包好的 VSIX：

```powershell
code --install-extension "D:\OthCode\DelphiBuilder\delphi-dcc-builder-0.2.6.vsix"
```

也可以在 VS Code 扩展视图右上角菜单中选择“从 VSIX 安装...”，然后选择 `delphi-dcc-builder-0.2.6.vsix`。

安装或更新后，建议重新加载 VS Code 窗口。

## 命令

可以从命令面板执行以下命令：

| 命令 | 说明 |
|------|------|
| `Delphi DCC Builder: Build for Win32` | 使用 DCC32 读取配置并增量编译当前项目 |
| `Delphi DCC Builder: Build for Win64` | 使用 DCC64 读取配置并增量编译当前项目 |
| `Delphi DCC Builder: Rebuild for Win32` | 使用 DCC32 添加 `-B`，重新编译项目及其依赖单元 |
| `Delphi DCC Builder: Cancel Build` | 终止当前 DCC32/DCC64 进程及其子进程 |
| `Delphi DCC Builder: Change Output Path` | 修改所选配置和平台的 `DCC_ExeOutput` |
| `Delphi DCC Builder: Show Build Plan` | 查看默认 Win32 构建的编译器、环境、参数和预期产物 |

在资源管理器中右键 `.dproj` 文件，始终可以执行 `Build for Win32`。只有 `delphiXe7.compiler64Path` 非空时，才会额外显示 `Build for Win64`。如果项目包含多个配置，随后弹出的选择列表会显示对应平台的 Debug、Release 等选项；只有一个配置时直接使用该配置。

Rebuild 仍可从命令面板执行，但不占用右键菜单。Show Build Plan 始终可从命令面板执行；右键菜单入口由 `delphiXe7.showBuildPlanMenu` 控制，默认隐藏。

右键 `.dproj` 执行 `Delphi DCC Builder: Change Output Path` 后，扩展会按构建流程选择平台和配置。输入框预填当前有效的 `DCC_ExeOutput`；修改成功后，修改前地址和新地址都会进入该 dproj 的历史记录。历史按规范化后的 dproj 完整路径隔离，默认保留最近 5 条，可配置为 1-15 条。确认后会立即保存 `.dproj`，并写入所选 `配置|平台` 的专用覆盖项，因此修改 `Release|Win32` 不会影响 Debug 或 Win64。

状态栏中的 `Delphi DCC Builder` 按钮用于启动 Win32 编译；编译期间按钮会变为运行状态，单击可取消编译。

## 推荐使用流程

1. 使用 VS Code 打开包含 `.dproj` 的工作区。
2. 将工作区标记为 Trusted Workspace。执行编译时必须信任工作区。
3. 显式设置 `delphiXe7.compilerPath`；需要 Win64 时再设置 `delphiXe7.compiler64Path`。
4. 首次使用可从命令面板执行 `Delphi DCC Builder: Show Build Plan`。
5. 检查 `compilerPath`、`workingDirectory`、配置、平台、搜索路径和输出目录。
6. 确认 Build Plan 中没有未解析宏或关键警告。
7. 右键 `.dproj` 执行 Build，并选择项目实际声明的配置。
8. 在 Output 面板查看完整 DCC 输出，在 Problems 面板查看可跳转的诊断。

当工作区中存在多个 `.dproj` 时，扩展会弹出项目选择列表。项目选择优先级为：

项目选择列表按当前 VS Code 工作区保存最近使用记录，初始最多显示 10 个项目；新工作区没有历史时列表为空，输入关键字后仍会搜索当前工作区内的全部 `.dproj`。

```text
命令参数或右键选择的 .dproj
-> 当前编辑器打开的 .dproj
-> 工作区内搜索到的 .dproj
```

## 配置

可以在工作区的 `.vscode/settings.json` 中配置：

```json
{
  "delphiDcc.version": "XE7",
  "delphiXe7.compilerPath": "D:\\Program Files (x86)\\Embarcadero\\Studio\\15.0\\bin\\DCC32.exe",
  "delphiXe7.compiler64Path": "D:\\Program Files (x86)\\Embarcadero\\Studio\\15.0\\bin\\DCC64.exe",
  "delphiXe7.showBuildPlanMenu": "hide",
  "delphiXe7.outputPathHistoryLimit": 5,
  "delphiXe7.outputEncoding": "system",
  "delphiXe7.additionalArguments": [],
  "delphiXe7.environment": {}
}
```

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `delphiDcc.version` | `XE7` | Delphi 版本下拉选择；当前仅支持 XE7 |
| `delphiXe7.compilerPath` | 空 | 必填，`DCC32.exe` 的绝对路径；为空时构建报错 |
| `delphiXe7.compiler64Path` | 空 | 可选，`DCC64.exe` 的绝对路径；非空时显示 Win64 右键构建命令 |
| `delphiXe7.showBuildPlanMenu` | `hide` | `.dproj` 右键菜单是否显示 Show Build Plan，可选 `hide`、`show` |
| `delphiXe7.outputPathHistoryLimit` | `5` | 每个 `.dproj` 保存的产物地址历史记录数，范围 1-15 |
| `delphiXe7.outputEncoding` | `system` | DCC32/DCC64 输出编码，可选 `system`、`cp936`、`utf8` |
| `delphiXe7.additionalArguments` | `[]` | 在主源码参数之前追加的 DCC 参数数组 |
| `delphiXe7.environment` | `{}` | 在 XE7 注册表环境之后覆盖的环境变量 |

扩展不会自动选择 DCC32 或 DCC64，必须明确设置对应路径。不要通过 `cmd.exe` 拼接完整命令，额外参数应分别写入数组：

```json
{
  "delphiXe7.additionalArguments": [
    "-Q",
    "-W+"
  ]
}
```

## 其他扩展调用

其他 VS Code 扩展可以通过命令 API 发起构建：

```ts
await vscode.commands.executeCommand("delphiXe7.buildProject", {
  project: "D:\\Company\\App\\App.dproj",
  configuration: "Debug",
  platform: "Win32"
});

await vscode.commands.executeCommand("delphiXe7.buildProjectWin64", {
  project: "D:\\Company\\App\\App.dproj",
  configuration: "Release"
});
```

`project` 可以是绝对路径或相对工作区路径。`buildProject` 默认使用 Win32，也可以通过 `platform: "Win64"` 使用 Win64；`buildProjectWin64` 始终使用 Win64。

## Build Plan

Build Plan 是扩展最终交给编译器的构建描述，主要包含：

- `.dproj` 和主源码绝对路径
- `DCC32.exe` 或 `DCC64.exe` 路径
- 编译工作目录
- Config 和 Platform
- 最终环境变量
- 保持顺序的 DCC 参数数组
- 预期 EXE、DLL 或 BPL 产物
- 未支持属性、未解析宏和 MSBuild Import 提示

显示 Build Plan 时，名称中包含 token、secret、password 或 API key 的环境变量会自动脱敏。

## 当前支持范围

- Windows
- Delphi XE7 / BDS 15.0
- DCC32 / Win32
- DCC64 / Win64（配置 `compiler64Path` 后启用）
- `.dproj` 项目
- `.dpr` 应用或库项目
- `.dpk` 包项目
- Debug、Release 和项目自定义配置
- 可以直接表示为 DCC 参数的常用 `DCC_*` 项目属性

当前不支持：

- `.groupproj` 多项目依赖构建
- Android、iOS 等其他平台
- 任意自定义 MSBuild Targets
- 自动执行编译前或编译后脚本
- 部署、签名和安装包生成

扩展不会执行 `.dproj` 中的 MSBuild `Import` 或 `Target`。遇到未支持内容时会写入 Build Plan 警告，不会静默忽略。

## Delphi 版本配置文件

不同 Delphi 版本的 BDS 信息和 DCC 命令映射保存在仓库根目录的 `delphi-versions/` 中。目前使用 `delphi-versions/XE7.json`，字段格式由 `delphi-versions/schema.json` 定义，可在支持 JSON Schema 的编辑器中直接校验和补全。

每个版本配置文件包含：

- BDS 注册表版本和 Studio 目录版本
- Win32、Win64 编译器文件名及对应的 VS Code 设置名称
- 基础参数和 Rebuild 参数
- Unit、Include、Resource 搜索路径及运行时包开关
- `.dproj` 普通值属性和路径属性到 DCC 开关的映射
- 有顺序的布尔值、枚举值参数规则
- 已识别但无需生成命令行参数的 DCC 元数据属性

`dcc.argumentRules` 的数组顺序就是生成 DCC 参数的顺序；某个值对应空数组表示识别该值但不生成参数。

新增 Delphi 版本时：

1. 复制 `delphi-versions/XE7.json`，修改版本号、BDS 信息和 DCC 参数映射。
2. 在 `package.json` 的 `delphiDcc.version` 中同步增加 `enum` 和 `enumItemLabels`。VS Code 的设置下拉来自静态扩展清单，不能在运行时动态增加。
3. 按配置文件中的 `settingsSection`、`compilerSettingNames` 在 `package.json` 增加对应版本的编译器路径设置。
4. 增加单元测试，并使用真实编译器完成 Win32/Win64 集成验证后再声明支持该版本。

运行时会自动发现 `delphi-versions/` 下除 `schema.json` 外的所有 JSON 配置。只有当新编译器的行为无法用现有 Schema 表达时，才需要修改 TypeScript 通用构建逻辑。

## 常见问题

### 找不到 DCC32.exe

先确认 Delphi XE7 已安装，并将 `delphiXe7.compilerPath` 设置为实际编译器绝对路径。扩展仍会从以下位置读取 XE7 环境和 Library Path，但不会用注册表值替代空的编译器设置：

```text
HKCU\Software\Embarcadero\BDS\15.0
HKLM\Software\Embarcadero\BDS\15.0
```

如果该设置为空，构建会提示先配置 DCC32 路径。

### 为什么没有 Win64 右键菜单

Win64 入口只在 `delphiXe7.compiler64Path` 非空时显示。请将其设置为真实 `DCC64.exe` 绝对路径；运行构建时扩展还会校验该文件是否存在。Win64 构建读取注册表中的 `Library\Win64` Search Path 和 Debug DCU Path，不会复用 Win32 DCU 路径。

### 提示找不到 dcc32compiler.exe

这通常说明当前 `DCC32.exe` 是一个依赖内部编译器的启动器，但对应文件缺失。应修复 XE7 安装，或者将 `delphiXe7.compilerPath` 指向经过验证、可以独立运行的 DCC32 编译器。

当前开发机的默认启动器存在该问题，实机测试使用了：

```json
{
  "delphiXe7.compilerPath": "D:\\Program Files (x86)\\Embarcadero\\Studio\\15.0\\bin\\DCC32.EXE.old"
}
```

该文件名是当前开发机特有情况，不应直接复制到其他机器。

### 编译输出乱码

中文 Windows 通常可以显式设置：

```json
{
  "delphiXe7.outputEncoding": "cp936"
}
```

如果编译器输出本身是 UTF-8，则改为 `utf8`。

### IDE 能编译，但扩展找不到 Unit

先执行 Show Build Plan，重点比较：

- `-U`、`-I`、`-R`、`-O` 的内容和顺序
- 当前平台对应的 BDS Library Path 中的宏是否已展开
- Build Plan 是否以 `--no-config` 开头
- Runtime Packages、Namespace 和 Unit Alias
- 当前选择的 Config 和 Platform

搜索路径顺序不同可能导致引用另一个同名单元，即使路径内容看起来相同。

从 `0.1.3` 开始，扩展会像 XE7/MSBuild 一样，将完整 Unit Search Path 同时传给 DCC32 的 `-U` 和 `-I`。这也适用于 FastReport 单元通过 `{$I frx.inc}` 引用位于 Library Path 其他目录中的包含文件。

从 `0.2.1` 开始，扩展固定传入 `--no-config`，不会再加载编译器目录或项目目录中的 `dcc32.cfg`。需要的 Unit Alias、搜索路径和其他参数应来自 `.dproj`、BDS 注册表或 `delphiXe7.additionalArguments`，以保证 Build Plan 与实际命令一致。

从 `0.2.2` 开始，扩展会按照 XE7 `CodeGear.Delphi.Targets` 合并翻译资源目录、BRCC 输出目录、项目 Unit Search Path、项目 Resource Path 和当前平台的 BDS Library Path，并显式传入 `-R`。这用于解决 BDS 可以编译、插件却提示 `Controls.res`、`midas.res`、`Vcl.DBLogDlg.dfm` 或 FireDAC `.dfm` 找不到的问题。

### Release 产物为什么接近 Debug 大小

`DCC_DebugDCUs` 表示使用带调试信息的 Delphi DCU，它本身不等于“向 EXE 写入调试信息”。`0.2.1` 已按 XE7 官方 DCC task 修正以下映射：

- `DCC_DebugDCUs=true`：只将 Debug DCU Path 前置到 `-U`，不再产生 `-V`
- `DCC_DebugInfoInExe=true`：产生 `-V` 和 `-VN`
- `DCC_DebugInformation=0/1/2`：分别产生 `-$D0`、`-$D1`、`-$D2`
- `DCC_SymbolReferenceInfo=0/1/2`：分别产生 `-$Y-`、`-$YD`、`-$Y+`
- `DCC_Optimize=true/false`：分别产生 `-$O+`、`-$O-`

搜索路径中出现皮肤源码目录，并不会自动把所有皮肤链接进 EXE。应优先检查 Build Plan 中是否仍有 `-V`、`-VN`、Map File 参数，以及项目源码是否实际引用了皮肤单元。

### IDE 能编译，但提示 Required package not found

`.dproj` 中的 `DCC_UsePackage` 只是运行时包候选列表。XE7 仅在 `UsePackages` 或 `DCC_EnabledPackages` 为 `true` 时，才会将该列表作为 `-LU` 参数传给 DCC32。

从 `0.1.2` 开始，扩展与 XE7/MSBuild 使用相同条件。未启用运行时包时，不会因为候选列表中存在本机未安装的 `CodeSiteExpressPkg` 等包而错误地传入 `-LU`；项目确实启用运行时包时，仍需安装对应的 `.dcp` 包或将其目录加入搜索路径。

### 编译失败但 Problems 面板为空

完整原始输出始终保留在 `Delphi DCC Builder` Output Channel 中。没有文件名和行号的全局错误无法发布为可跳转诊断，但仍会显示在输出面板和失败通知中。

## 开发

安装依赖：

```powershell
npm install
```

常用命令：

```powershell
npm run check
npm test
npm run test:xe7
npm run compile
npm run package
```

| 命令 | 说明 |
|------|------|
| `npm run check` | TypeScript 严格类型检查 |
| `npm test` | 运行不依赖 Delphi 安装的常规测试 |
| `npm run test:xe7` | 使用本机真实 DCC32 执行成功和失败编译测试 |
| `npm run compile` | 使用 esbuild 生成扩展 bundle |
| `npm run package` | 检查、测试、编译并生成 VSIX |

在 VS Code 中按 `F5` 可以启动 Extension Development Host。打包产物位于项目根目录。

## 验证状态

版本 `0.2.5` 当前已通过：

- 44 项常规测试
- 3 项真实 Delphi XE7 集成测试（包括 DCC64 Win64 编译）
- TypeScript 严格类型检查
- esbuild 打包
- VSIX 生成和内容检查

在正式用于业务项目之前，仍应使用真实项目的 XE7 IDE 完整命令行作为基准，对 Build Plan 中的参数和值顺序逐项校准。
