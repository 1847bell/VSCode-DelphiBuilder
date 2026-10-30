# Delphi DCC Builder

> **开发中 / 试验性功能：MCP 功能尚未完成真实业务项目与独立用户环境下的完整实机测试，不保证稳定性或生产可用性。** 当前验证仅包括自动化测试与本机 XE7 示例冒烟，不等于完整功能验收。请仅在已备份的项目副本上试用。

在 Visual Studio Code 中直接调用 Delphi 命令行编译器编译项目。扩展会读取 `.dproj` 配置，生成可查看的 Build Plan，运行 `DCC32.exe` 或 `DCC64.exe`，并将编译诊断发布到 Problems 面板。

链接：[代码仓库](https://github.com/1847bell/VSCode-DelphiBuilder) · [问题与功能请求](https://github.com/1847bell/VSCode-DelphiBuilder/issues) · [Delphi 版本配置说明](docs/DELPHI_VERSION_CONFIGURATION.md) · [English README](README.md)

## MCP 独立开发分支

**`DelphiBuilder-MCP` 是长期独立的 MCP 开发分支，永久不合并回 `main`。后续仅开发 MCP 相关功能，不在此分支开展 VS Code 插件功能开发。** 现有插件代码保留，供 MCP 共用 Delphi 编译核心；MCP 不需要启动 VS Code。

试用入口：[中文试用手册](docs/MCP_TRIAL_GUIDE_CN.md) · [AI Skill / 可复用提示词](skills/delphi-builder-mcp/SKILL.md)。`npm run package:mcp` 输出 `release/DelphiBuilder-MCP-<版本>.zip`、解包目录与 SHA-256 校验文件。ZIP 包含已打入 JS 的 npm 运行依赖、版本配置、文档、依赖许可和示例项目；解压后无需 `npm install`、VS Code 或 VSIX。请另外安装 Node.js 22/24 LTS 与合法的 Delphi 工具链。

### 安装与启动

需要 Windows、Node.js 22 或更高版本，以及本机可用的 Delphi XE7/BDS 15.0 编译环境。

```powershell
npm ci
npm run compile:mcp
Copy-Item mcp.config.example.json mcp.config.json
# 编辑 mcp.config.json 的 roots 和编译器路径
npm run start:mcp -- --config D:/OthCode/DelphiBuilder/mcp.config.json
```

服务使用 stdio，等待 MCP 客户端发送协议消息；直接启动后等待输入是正常行为，不是交互式命令行。客户端应直接启动 `node dist/mcp.js`，不要通过可能向 stdout 输出提示的 npm 脚本启动。

配置示例：

```json
{
  "roots": ["D:/DelphiProjects"],
  "compilerPath": "C:/Program Files (x86)/Embarcadero/Studio/15.0/bin/DCC32.exe",
  "compiler64Path": "C:/Program Files (x86)/Embarcadero/Studio/15.0/bin/DCC64.exe",
  "version": "XE7",
  "resourceBuild": true,
  "outputEncoding": "system"
}
```

`roots` 必须是已存在的可信项目目录。配置文件内的相对目录和工具路径相对于配置文件；工具参数中的相对 `projectFile` 相对于第一个 root。相对输出路径则相对于 `.dproj` 所在目录，并保留 `$(Config)`、`$(Platform)` 等可解析的项目属性表达式。配置可额外提供 `rsvarsPath`、`brcc32Path`、`additionalArguments` 和 `environment`；这些只能由本地配置指定，不能通过工具调用覆盖。`compiler64Path` 可省略；仅查询项目信息时不需要配置编译器。机器专用的 `mcp.config.json` 已加入 Git 忽略规则。

配置文件支持带或不带 BOM 的 UTF-8，包括 Windows PowerShell 生成的文件。修改输出路径时，`$(DCC_ExeOutput)` 引用修改前的有效输出目录，并在保存时固化一次；后续查询不会重复追加后缀。

项目查询、修改和编译计划使用相同的 BDS、rsvars 和本地配置属性环境。版本修改保留生效的非版本元数据，并在表达式含义不变时保留原始表达式。

### MCP 客户端配置

将下列条目放入客户端支持的 MCP 配置中，并替换为本机绝对路径：

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

| 工具 | 作用 |
| --- | --- |
| `get_project_info` | 查询配置列表、当前配置/平台、主源、有效输出目录、版本、资源和警告。 |
| `get_build_plan` | 生成编译计划，不编译、不写文件；响应不包含继承的环境变量。 |
| `start_build` | 异步编译，`rebuild: true` 时重新编译；立即返回 `jobId`。 |
| `get_build_status` | 获取状态、编译计划警告、日志分页、退出信息、诊断及预期/现有产物。 |
| `cancel_build` | 请求取消；继续查询状态直至进入终态。 |
| `set_output_path` | 修改指定配置与平台的 `DCC_ExeOutput`。 |
| `set_project_version` | 修改指定配置与平台的文件/产品版本，每段为 0–65535，允许 1–4 段。 |

项目工具接收 `projectFile`；查询和构建可省略 `configuration`，使用 `.dproj` 默认配置，`platform` 默认 `Win32`。两个修改工具必须明确传入 `configuration` 和 `platform`，分别另传 `outputPath` 或 `version`。

调用示例：`start_build({"projectFile":"App/App.dproj","configuration":"Release","platform":"Win64","rebuild":true})`。随后调用 `get_build_status({"jobId":"返回的 ID","offset":0,"limit":16384})`，按 `nextOffset` 继续读取，直至终态且 `nextOffset === totalLength`。日志偏移按 JavaScript 字符串的 UTF-16 代码单元计数，单次最多 65536；状态为 `queued`、`running`、`succeeded`、`failed` 或 `cancelled`。失败诊断包含文件、行列（可用时）、级别、代码及消息；编译准备失败还会返回 `error`。工具输入或操作错误以 MCP `isError` 返回，编译失败则记录在任务状态中。

### 写入与生命周期边界

- 同一项目的编译和修改互斥；不同项目可并行。项目信息查询可在编译期间使用。
- 修改器仅接受有效 UTF-8，保留 BOM 和换行格式；先写入同目录临时文件，检查源文件是否变化，再原子替换。并发查询只会读取完整的旧版或新版项目。不要在 IDE 中保留未保存的 `.dproj` 修改，MCP 无法读取编辑器内存内容。
- 构建会写产物，启用资源步骤时还可能创建或更新项目 `.res`；不会自动运行生成的 EXE。输出路径、主源和资源输入/输出路径必须位于配置的 roots 内，已知符号链接越界会被拒绝。第三方库搜索路径仍可指向外部安装目录。
- `start_build` 请求处理期间收到 MCP 取消通知，会取消尚未完成的启动或刚创建的任务；收到 `jobId` 后使用 `cancel_build`。准备、资源和 DCC 阶段之间均检查取消；已完成的文件写入不会回滚。
- roots 检查不是操作系统沙箱：只接入可信项目和可信编译器配置，不对恶意源码、链接竞争或任意编译器行为提供隔离保证。
- 任务只在当前服务进程内保存，保留最近完成的 50 项；服务重启后任务 ID 失效。stdin 关闭或收到退出信号时会取消活动构建并等待清理。
- 部署时保留已打包的 `dist/mcp.js` 与 `delphi-versions/` 原有目录布局；npm 运行依赖已包含在 JS 中。不需要 VSIX，不使用 VS Code 的设置、项目分组或历史记录。

开发检查：`npm run check`、`npm test`、`npm run compile:mcp`；Windows 试用打包：`npm run package:mcp`（需要 PowerShell）。安装与验收流程见[试用手册](docs/MCP_TRIAL_GUIDE_CN.md)。下文保留原 VS Code 插件说明，MCP 使用方式以上述章节为准。

## 主要功能

- 使用 `DCC32.exe` 编译 Win32；配置 `DCC64.exe` 后可编译 Win64。
- 读取 `.dproj` 声明的配置，并编译选定的配置和平台。
- 在 Activity Bar 中维护 Delphi 项目分组。
- 从资源管理器右键菜单添加 `.dproj`，支持在分组内调整项目顺序、在分组之间移动项目，或从分组中移除项目而不删除项目文件。
- 支持自动分组排序、分组上移、分组下移、重命名和刷新。
- 为分组项目选择当前配置，并直接从项目树启动 Win32 或 Win64 编译。
- 在项目名称行点击 **定位到项目位置** 按钮，即可跳转到资源管理器并定位到 `.dproj` 文件。
- 提供编译、重新编译、取消编译、查看编译计划和修改输出路径命令。
- 按项目保存输出路径历史，并为不同配置和平台保存独立覆盖值。
- 修改指定配置和平台的项目版本号，并将版本信息同步到编译生成的 EXE 或 DLL。
- 在 Build Plan 中显示编译器路径、工作目录、参数、资源步骤、警告和预期产物。
- 支持系统编码、CP936、UTF-8 解码 DCC 输出，并将源文件位置发布到 Problems 面板。
- 在 DCC 前处理资源：
  - 使用 BDS 的 `BRCC32.exe` 编译 `.dproj` 中的 `RcCompile` 项。
  - 主源包含 `{$R *.res}` 且同名项目资源缺失时，创建最小有效 `.res`。
  - 更新已有项目 `.res` 中的版本信息，同时保留图标及其他非版本资源。
  - `RcItem` 项目资源无法由直接 DCC 流程完整模拟，会在 Build Plan 中给出警告。
- 自动发现 `rsvars.bat` 和 `BRCC32.exe`，非标准安装也可以显式配置路径。
- 固定使用 `--no-config`，避免编译器 `.cfg` 文件静默改变 Build Plan。
- 扩展界面和自定义设置页支持 English 与简体中文。

## 支持范围与测试状态

当前唯一实现并在真实机器上测试过的编译器是 **Delphi XE7 / BDS 15.0**，运行环境为 Windows。测试覆盖 XE7 Win32、XE7 Win64、资源预处理、诊断和项目侧边栏。其他 Delphi 版本即使命令行参数相似，也不代表已经兼容。

如果需要其他 Delphi 版本并且可以自行实现支持，请先 git clone 本项目，创建以编译器版本命名的分支（例如 `version-xe8`），补充配置和测试，测试通过后发起 Pull Request。如果需要协助，请将 JSON 配置、测试和生成的 Build Plan 附加到 [Issue](https://github.com/1847bell/VSCode-DelphiBuilder/issues)。如有条件，也请附上编译器版本、BDS 目录结构、注册表值和真实编译测试结果。

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

## 修改项目版本号

1. 在 Delphi 项目视图中展开项目，选择当前配置，例如 `Debug` 或 `Release`。
2. 点击 **修改输出路径** 下方的 **修改版本号**。也可以从命令面板运行 **Delphi DCC Builder: 修改版本号**，按提示选择项目和配置。
3. 核对输入框提示中的配置和平台，输入由点分隔的 1 至 4 段数字（例如 `1.2.3.4`），按 Enter 将修改保存到 `.dproj` 文件。项目树中的入口针对当前配置的 **Win32** 平台。

输入框会预填该配置和平台下实际生效的 `FileVersion`，并考虑继承的设置；缺失时依次使用 `ProductVersion`、数字版本字段，没有定义版本时使用 `1.0.0.0`。保存时会在已有的配置/平台属性组中同时更新 `FileVersion`、`ProductVersion` 和数字版本字段，必要时新增对应的属性组。其他配置和平台保留各自的版本设置，输出路径等无关项目设置也会保留。

下次编译时，只要 `delphiDcc.resourceBuild` 已启用（默认开启），且主源文件包含 `{$R *.res}`，扩展就会在运行 DCC 前将 `.dproj` 中实际生效的版本信息同步到项目 `.res`。生成的 EXE 或 DLL 因而包含更新后的文件版本和产品版本，同时保留图标及其他非版本资源。

## 设置项

| 设置 | 默认值 | 作用 |
| --- | --- | --- |
| `delphiDcc.language` | `en` | 扩展界面语言：`en` 或 `zh-cn`。 |
| `delphiDcc.version` | `XE7` | 选择 Build Plan 使用的版本配置。 |
| `delphiDcc.resourceBuild` | `true` | 准备缺失的项目资源、同步项目版本信息并编译 `RcCompile` 资源。 |
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

完整字段说明和贡献者检查表请参见顶部链接中的版本配置说明。

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
