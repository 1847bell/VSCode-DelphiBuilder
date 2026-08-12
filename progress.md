# 进度日志

## 会话：2026-07-31

### 阶段 1：基线与工程骨架
- **状态：** complete
- **开始时间：** 2026-07-31
- 执行的操作：
  - 阅读产品规划、代码库记忆和适用技能说明。
  - 确认当前目录仅有规划文档且不是 Git 仓库。
  - 定义本轮首版垂直切片及验证标准。
  - 验证 Node、npm 和 VS Code CLI 均已可用。
  - 创建扩展清单、构建/测试配置、调试任务和 README。
  - 安装 npm 依赖并生成 lockfile。
- 创建/修改的文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `package.json`、`package-lock.json`
  - `tsconfig.json`、`esbuild.mjs`、`vitest.config.ts`
  - `.vscode/launch.json`、`.vscode/tasks.json`
  - `.vscodeignore`、`.gitignore`、`README.md`、`CHANGELOG.md`

### 阶段 2：BuildPlan 核心
- **状态：** complete
- 执行的操作：
  - 实现 BuildPlan/诊断公共类型。
  - 实现大小写不敏感的递归属性展开和循环检测。
  - 实现不使用 eval 的 Condition 词法及语法解析器。
  - 实现 preserve-order dproj 配置发现、继承键注入和属性求值。
  - 实现 BDS 15.0 注册表发现、环境变量和 Win32 Library Path 合并。
  - 实现 DCC 参数数组、输出路径、开关映射及 BuildPlan 生成。
- 创建/修改的文件：
  - `src/core/types.ts`
  - `src/project/propertyResolver.ts`
  - `src/project/conditionEvaluator.ts`
  - `src/project/dprojParser.ts`
  - `src/environment/registryReader.ts`
  - `src/environment/bdsLocator.ts`
  - `src/compiler/dccArgumentBuilder.ts`
  - `src/compiler/buildPlan.ts`
  - `test/fixtures/Sample.dproj`
  - `test/unit/conditionEvaluator.test.ts`
  - `test/unit/propertyResolver.test.ts`
  - `test/unit/dprojParser.test.ts`
  - `test/unit/registryReader.test.ts`
  - `test/unit/dccArgumentBuilder.test.ts`

### 阶段 3：编译与 VS Code 集成
- **状态：** complete
- 执行的操作：
  - 实现 DCC32 Buffer 解码、进程执行、输出目录准备及 Windows 进程树取消。
  - 实现两类 XE7 诊断格式解析和 Problems 发布。
  - 实现项目/配置选择、Build/Rebuild/Cancel/Show Build Plan 命令。
  - 实现 Output Channel、进度通知、状态栏和构建结果提示。
  - 审查 VSIX 文件清单和外部进程调用，修正全局库路径继承、取消相对路径及产物存在性处理。
- 创建/修改的文件：
  - `src/compiler/outputEncoding.ts`
  - `src/compiler/compilerRunner.ts`
  - `src/compiler/diagnosticParser.ts`
  - `src/vscode/diagnosticPublisher.ts`
  - `src/commands/buildCommands.ts`
  - `src/extension.ts`
  - `test/unit/diagnosticParser.test.ts`
  - `test/unit/compilerRunner.test.ts`

### 阶段 4：测试与打包
- **状态：** complete
- 执行的操作：
  - 单元与假编译器集成测试达到 16 项并全部通过。
  - 成功生成 `delphi-xe7-build-0.1.0.vsix`。
  - 确认本机 BDS 15.0 和 Win32 Library Path 可用于真实编译。
  - 添加独立的 XE7 实机集成测试配置与最小控制台工程。
  - 使用真实 XE7 验证成功构建和错误诊断，并检测 dcc32.cfg 隐式配置来源。

### 阶段 5：交付
- **状态：** complete
- 执行的操作：
  - 重新执行类型检查、常规测试、真实 XE7 测试、bundle 和 VSIX 打包。
  - 最终 VSIX 为 `delphi-xe7-build-0.1.0.vsix`，仅包含 manifest、package.json、README 和 bundle。
  - VSIX SHA-256：`2BA6580BF3BF67717FB4F871C34988887CA1256E9A5E138E469985998526BE05`。
  - 记录本机默认 DCC32 启动器缺失依赖，测试通过 compilerPath 使用原编译器备份。

## 测试结果
| 测试 | 输入 | 预期结果 | 实际结果 | 状态 |
|------|------|---------|---------|------|
| TypeScript 严格检查 | 全部 src/test | 无类型错误 | 通过 | passed |
| 常规测试 | 8 个测试文件 | 全部通过 | 18/18 通过 | passed |
| XE7 成功编译 | Sample.dproj / Debug / Rebuild | 生成 Sample.exe | 通过 | passed |
| XE7 错误诊断 | Broken.dpr | 返回非零并解析 Error | 通过 | passed |
| esbuild bundle | src/extension.ts | 生成 dist/extension.js | 通过 | passed |
| VSIX 打包 | package.json + dist | 生成可安装包 | 557.23 KB，6 个文件 | passed |

## 错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-07-31 | `git status`：当前目录不是 Git 仓库 | 1 | 不依赖 Git，继续创建新工程 |
| 2026-07-31 | dproj 测试发现 Debug/Release 条件同时为真 | 1 | 按 MSBuild 语义在 Condition 中将未定义属性展开为空字符串 |
| 2026-07-31 | TypeScript 报通知按钮参数可能为 undefined | 1 | 有无产物分别调用对应的 VS Code API 重载 |
| 2026-07-31 | 真实 XE7 测试发现 BDSLIB/BDSCOMMONDIR 宏残留 | 1 | 读取 rsvars.bat、派生 BDSLIB，并按层次逐项展开环境 |
| 2026-07-31 | 本机 DCC32.exe 依赖的 dcc32compiler.exe 缺失 | 1 | 不修改外部安装，集成测试改用 compilerPath 覆盖 |
| 2026-07-31 | 真实 DCC32 错误未进入诊断 | 1 | 发现裸 CR 进度输出并改为按 CR/LF 分割 |
| 2026-07-31 | 完成状态批量更新未匹配现有进度文字 | 1 | 重新读取文件后精确更新 |

## 五问重启检查
| 问题 | 答案 |
|------|------|
| 我在哪里？ | 首版已完成 |
| 我要去哪里？ | 下一步用真实业务项目和 IDE 命令行做一致性校准 |
| 目标是什么？ | 可打包且具备完整首版构建链路的 VS Code 扩展 |
| 我学到了什么？ | 见 findings.md |
| 我做了什么？ | 见上方记录 |

## 会话：2026-07-31（配置与菜单重构）

### 阶段 6：基线与需求确认
- **状态：** complete
- 已恢复历史规划文件并运行 session-catchup。
- 确认当前目录不是 Git 仓库；用户已明确授权初始化并提交当前 0.1.4 状态。
- 已初始化 `main` 分支并暂存 43 个基线文件；生成物和依赖均由 `.gitignore` 排除。
- 已创建基线提交 `76ed7b4 chore: establish Delphi XE7 builder baseline`，提交后工作区干净。
- 确认 VS Code 贡献菜单是静态清单，不能按 dproj 内容或字符串数组动态创建菜单标题。
- 决定使用右键 `Build Project...` 后读取 dproj 配置并弹出 Quick Pick；Rebuild 移出右键但保留命令面板。

### 阶段 6：配置与菜单实现
- **状态：** complete
- 已在 `buildCommands.ts` 增加空 compilerPath 报错，移除默认项目/配置读取，并按 dproj 配置生成 Quick Pick 选项。
- 已在 `package.json` 移除两个默认设置和 Rebuild 右键项，增加默认 hide 的 `showBuildPlanMenu`。
- 已增加 manifest 回归测试并将开发版本提升到 0.2.0。
- 定向验证通过：extension manifest 2 项、dproj parser 4 项、TypeScript 严格检查。
- 已更新中英文 README 和 Changelog，说明 DCC 路径必填、配置 Quick Pick、Rebuild 命令面板入口及 Build Plan 菜单显隐。
- 静态审查确认旧 defaultProject/defaultConfiguration 仅存在于“必须不存在”的测试断言中，package.json 可正常解析。
- 完整验证通过：25/25 常规测试、2/2 真实 XE7 集成测试、TypeScript 检查、esbuild 和 VSIX 打包。
- 已生成 `delphi-xe7-build-0.2.0.vsix`；打包仅有既有的 repository/LICENSE 元数据警告。
- `git diff --check` 通过，当前变更仅含预期源码、清单、测试、文档和规划文件，VSIX/测试产物未进入 Git 状态。
- 逐段 diff 审查通过，功能与文档范围符合本轮五项需求。
- 明确边界：本轮未泛化 BDS 15.0 环境解析，Delphi 13 支持需在独立提交中校准。
- 本轮以 0.2.0 配置与菜单重构功能提交收尾。

### 本轮错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-07-31 | `git diff --stat`：当前目录不是 Git 仓库 | 1 | 按用户要求初始化本地 Git 仓库并提交基线 |
| 2026-07-31 | `git diff --cached --check`：规划文档两处既有行尾空格 | 1 | 与本轮无关，记录后保留，不扩大改动范围 |
| 2026-07-31 | planning skill 的 `check-complete.ps1` 因乱码产生 PowerShell 解析错误 | 1 | 改用 `check-complete.sh` 完成收尾检查 |
| 2026-07-31 | PowerShell 无法从 PATH 找到 `sh` | 1 | 定位 Git Bash 后使用 `C:\Program Files\Git\bin\bash.exe` 绝对路径 |

---
*每个阶段完成后或遇到错误时更新此文件*

## 会话：2026-08-03（XE7 DCC 参数一致性修复）

### 阶段 7：根因确认与实现准备
- **状态：** complete
- 已依据同事的 Release Build Plan 和 XE7 官方 `CodeGear.Delphi.Targets`/`dcctask.xml` 确认错误参数映射。
- 已确认工作区仅有未跟踪的用户样本 `Untitled-1.json`，本轮不会修改或提交该文件。
- 计划将版本提升到 0.2.1，修复 Debug DCU、调试信息、符号信息、优化开关和隐式 dcc32.cfg 行为。
- 已实现 `--no-config`、XE7 三态调试/符号参数、`DCC_DebugInfoInExe` 和 `DCC_Optimize` 官方映射。
- 已从 BDS Win32 注册表读取并展开 Debug DCU Path，按 XE7 Targets 顺序前置到 `-U`，不再由 `DCC_DebugDCUs` 生成 `-V`。
- 已移除与 `--no-config` 冲突的 `.cfg` 隐式参数警告。
- 定向验证通过：16/16 项相关测试和 TypeScript 严格检查。
- 完整验证通过：32/32 项常规测试、2/2 项真实 XE7 集成测试、TypeScript 严格检查、esbuild 和 VSIX 打包。
- 最终 VSIX 为 `delphi-xe7-build-0.2.1.vsix`，包含中英文 README，不包含用户样本。
- VSIX SHA-256：`08F610C9BD2D27CC13B7F1533E2FB8E01CC73FC7C487933E1526C5E37B0F4DB9`。

### 本轮错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-08-03 | PowerShell 中组合 `rg` 正则的引号转义导致表达式未闭合 | 1 | 改用单引号和分离模式重新执行，只读检查未影响文件 |
| 2026-08-03 | 首次 0.2.1 VSIX 文件清单包含未跟踪的 `Untitled-1.json` | 1 | 在 `.vscodeignore` 排除 `Untitled-*.json`，并显式纳入中文 README 后重新打包 |

## 会话：2026-08-03（XE7 资源搜索路径修复）

### 阶段 8：根因校准
- **状态：** complete
- 用户业务项目通过 BDS 编译，但插件报告 38 个 VCL/FireDAC `.res/.dfm` 缺失错误。
- 会话恢复与 `git diff --stat` 已完成；跟踪文件无未提交改动，`Untitled-1.json` 保持未跟踪。
- 初步确认插件禁用 `dcc32.cfg` 后没有将完整库/单元搜索路径补入 `-R`，下一步对照 XE7 Targets 验证。
- 已确认 XE7 Targets 会将翻译资源、BRCC 输出、项目 Unit Search Path、项目 Resource Path 和全局 Delphi Library Path 合并后传给 DCC ResourcePath。
- 已确认用户 Build Plan 完全缺少 `-R`，根因成立；修复不需要重新启用 `dcc32.cfg`。
- 已在本机 XE7 安装中验证缺失名称对应的资源文件位于 Win32 release 库路径，修复方案可用真实安装验证。
- 已增加缺少显式 Resource Path 的回归测试；修复前按预期失败（参数数组没有 `-R`），证明测试能复现根因。
- 已按 XE7 Targets 顺序实现显式 `-R`，定向参数测试 12/12 和 TypeScript 严格检查通过。
- 真实 XE7 集成测试 2/2 通过，确认 DCC32 接受新资源路径且现有成功/失败编译行为不回归。
- 补丁版本已提升到 0.2.2，并更新中英文 README 和变更日志。
- 完整验证通过：33/33 项常规测试、2/2 项真实 XE7 集成测试、TypeScript 严格检查、esbuild 和 VSIX 打包。
- 最终 VSIX 为 `delphi-xe7-build-0.2.2.vsix`，大小 577881 字节；包内不含用户 Build Plan 样本。
- VSIX SHA-256：`E7D3077EC564879D666773DA357769FDD23A0199FC5DA277F45C2EE995F16A90`。

### 本轮错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-08-03 | 新增资源路径回归测试失败，实际参数没有 `-R` | 1 | 作为根因复现保留测试，按 XE7 Targets 实现完整 ResourcePath 合并 |

## 会话：2026-08-03（品牌重命名）

### 阶段 9：名称范围确认
- **状态：** complete
- 用户要求将插件名称改为 `Delphi DCC Builder`。
- 会话恢复和 `git diff --stat` 已完成；本地 `main` 与远程一致，`Untitled-1.json` 继续保持未跟踪。
- 决定统一包名、显示名、命令标题、设置标题、Output Channel、状态栏和 README 标题，同时保留 `delphiXe7.*` 内部标识兼容性。
- 本轮保持版本号 0.2.2。
- 已完成旧名称盘点；内部命令与设置键保留，技术范围和历史记录中的 XE7 描述保留。
- 已将 package/display name、命令标题、设置标题、Output Channel、错误前缀、状态栏、构建摘要和 README 统一为新品牌。
- 已新增 manifest 品牌与稳定命令 ID 回归测试；定向测试 3/3 和 TypeScript 严格检查通过。
- 静态残留检查通过，package.json 与 lockfile 版本仍为 0.2.2。
- 完整验证通过：TypeScript 严格检查、34/34 项常规测试、esbuild 和 VSIX 打包。
- 最终 VSIX 为 `delphi-dcc-builder-0.2.2.vsix`，包内包含图标和中英文 README，不包含用户样本。
- VSIX SHA-256：`602A21A04BCF12821414E46E8FE5C3CEB75D768E83C9D5353A39DCE280F4B396`。

## 会话：2026-08-03（Delphi XE7 品牌与 Win64 构建支持）

### 阶段 10：需求确认与实现准备
- **状态：** complete
- 用户要求品牌改为 `Delphi DCC Builder`，增加 DCC64 路径，并仅在该路径已配置时显示 Win64 右键构建入口。
- 工作区跟踪文件干净，本地 `main` 与远程一致；未跟踪用户样本 `Untitled-1.json` 保持不修改、不打包、不提交。
- 实现边界：DCC32 继续必填且现有 Build 命令保持 Win32；DCC64 为可选设置，新增独立 Win64 构建命令并按 Win64 dproj/注册表环境求值。
- 本轮保持版本号 0.2.2，验收包括清单条件、平台路径、类型检查、常规测试和 VSIX 打包。
- 已定位全部主要 Win32 硬编码层；DCC 参数构造可复用，平台差异主要位于 dproj 属性条件、注册表 Library 节点和编译器路径选择。
- 已新增 `DelphiPlatform` 并将 Win32/Win64 贯穿 dproj 求值、BuildPlan、BDS Library/Debug DCU 注册表读取及编译器选择。
- 已注册 `delphiXe7.buildProjectWin64`，其资源管理器菜单使用 `config.delphiXe7.compiler64Path` 条件控制；空设置不显示，运行时仍会再次校验非空路径。
- 已完成新品牌、package name、DCC64 设置和 Win64 命令清单修改，版本保持 0.2.2。
- 定向验证通过：TypeScript 严格检查，以及清单、dproj、BDS 环境共 11/11 项测试。
- 已更新中英文 README 和 Changelog，说明新品牌、DCC64 可选设置、Win64 菜单显隐、平台专用 Library Path 及命令 API。
- 静态品牌与配置检查通过；package.json 可解析，包名为 `delphi-dcc-builder`，版本仍为 0.2.2，贡献 5 个命令。
- 已确认本机 XE7 的 DCC64.exe 和 Win64 Library 注册表节点可用，准备执行真实 Win64 fixture 编译。
- 已从 HKCU User Shell Folders 的 `Personal` 值派生 BDSUSERDIR，兼容重定向文档目录；对应单元断言已加入。
- 修复后定向测试 11/11、TypeScript 检查通过；真实 XE7 集成测试 3/3 通过，其中新增 DCC64 Win64 成功编译。
- 完整验证通过：36/36 常规测试、TypeScript 严格检查、esbuild 和 VSIX 打包；DCC64 产物 PE Machine 为 `0x8664`（x64）。
- 已生成 `delphi-dcc-builder-0.2.2.vsix`，包内包含图标和中英文 README。
- VSIX 内容检查确认不含用户样本 `Untitled-1.json`；文件大小 600180 字节，SHA-256 为 `A845479A5720EB8388E7938F24568FDE62CF032B5F46E8F69E1C7CA6C45D51A0`。
- 最终静态残留检查和 `git diff --check` 通过，改动范围仅包含品牌、Win64 构建链路、测试、文档及规划记录。

### 本轮错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-08-03 | 读取不存在的 `test/integration/fixtures/Sample.dproj` | 1 | 确认集成测试复用 `test/fixtures/Sample.dproj`，后续只修改和读取该 fixture |
| 2026-08-03 | 首次 DCC64 集成测试发现 Win64 Search Path 中 `$(BDSUSERDIR)` 未展开 | 1 | 保留失败断言，查询 XE7 实际环境来源后补齐 BDSUSERDIR 求值 |

## 会话：2026-08-03（0.2.3 发布）

### 阶段 11：版本与发布准备
- **状态：** complete
- 用户要求版本增加 0.0.1，当前 0.2.2 将提升为 0.2.3，随后打包、提交并推送。
- 工作区跟踪文件干净，本地 main 与远程一致；`Untitled-1.json` 继续保持未修改、未打包、未提交。
- 本轮仅更新版本、当前版本文档和发布记录，不修改已验证的 Win32/Win64 构建逻辑。
- 已使用 npm 标准版本命令将 package.json 与 package-lock.json 同步提升到 0.2.3，未创建 Git tag。
- 已更新 Changelog 的 0.2.3 发布段和中文 README 的当前版本、安装命令及 VSIX 文件名；0.2.2 资源路径历史说明保持不变。
- 0.2.3 完整验证通过：TypeScript 检查、36/36 常规测试、3/3 真实 XE7 集成测试、esbuild 和 VSIX 打包。
- 最终 VSIX 为 `delphi-dcc-builder-0.2.3.vsix`，大小 600196 字节；内容包含图标和中英文 README，不含 `Untitled-1.json`。
- VSIX SHA-256：`3FB37B8C33C66F0BC65E18B0CB1D4FB930D4C76110771607F689586E23A88367`。
- 最终版本一致性、VSIX 清单、差异范围和 `git diff --check` 均通过。

## 会话：2026-08-04（输出路径编辑菜单）

### 阶段 12：索引与设计确认
- **状态：** complete
- 已按用户要求用 codebase-memory-mcp 完整索引仓库；功能定稿后重建为 336 个节点、768 条关系，未生成仓库内索引制品。
- 工作区开始时已有用户对 `package.json` 和 `extensionManifest.test.ts` 的英文命令标题修改，本轮保留并与新命令保持一致。
- `Untitled-1.json` 继续保持未跟踪，不修改、不打包。
- 设计为单个英文 `Change Output Path` 右键命令：选择平台/配置后，通过可编辑 Quick Pick 预填当前有效 `DCC_ExeOutput` 并显示最近历史。
- 保存时写入配置与平台专用 PropertyGroup，避免修改 Base；写入前在内存中重新求值校验。
- 已注册 `delphiXe7.changeOutputPath`，并在 `.dproj` 右键菜单显示英文 `Delphi DCC Builder: Change Output Path`。
- DCC64 已配置时先选择 Win32/Win64，否则默认 Win32；配置选择继续复用 dproj 声明的 Debug、Release 或自定义配置。
- 可编辑 Quick Pick 会预填当前有效路径，并从 globalState 提供最近 10 条去重历史记录。
- 写入器优先更新精确配置/平台组，否则在 Delphi Targets Import 前新增覆盖组；保持 CRLF 并进行 XML 转义。
- 已打开的 dproj 通过 WorkspaceEdit 合并当前编辑器内容并保存，未打开文件写入前也会检查并发修改。
- 完整验证通过：40/40 常规测试、3/3 真实 XE7 集成测试、TypeScript 严格检查、esbuild 和 VSIX 打包。
- 最终 VSIX 为 `delphi-dcc-builder-0.2.3.vsix`，大小 607737 字节，版本号保持 0.2.3。
- VSIX SHA-256：`9E6D0F7D93EA403702CDE523AB73F45E84F849537AF4A989A6822AA9E7110C98`；包内不含用户样本。

## 会话：2026-08-04（0.2.4 发布）

### 阶段 13：版本与发布
- **状态：** complete
- 已使用 npm 标准版本命令将 package.json 与 package-lock.json 同步提升到 0.2.4，未创建 Git tag。
- 已将输出路径功能从 Unreleased 归入 0.2.4，并更新中英文 README 的版本和 VSIX 文件名。
- 已将构建命令统一为 `Build for Win32/Win64`，Rebuild 保留命令面板入口且仍不出现在右键菜单。
- 完整验证通过：40/40 常规测试、3/3 真实 XE7 集成测试、TypeScript 严格检查、esbuild 和 VSIX 打包。
- 最终 VSIX 为 `delphi-dcc-builder-0.2.4.vsix`，大小 607726 字节。
- VSIX SHA-256：`53513BA528A3AA611162D307896BCD7F9B470FFDD141A23C5374B31E6BA84258`。
- 最终差异审查和 `git diff --check` 通过，发布变更提交并推送到 `origin/main`。

## 会话：2026-08-04（按项目保存输出路径历史）

### 阶段 14：需求校正与实现准备
- **状态：** complete
- 用户确认首次 A -> B 后必须保留 A、B，继续改为 C 后保留 C、B、A。
- 历史按规范化 dproj 完整路径隔离；同一项目的 Debug/Release、Win32/Win64 共享记录。
- 新增整数设置 `delphiXe7.outputPathHistoryLimit`，默认 5，允许范围 1-15。
- 当前根因已确认：0.2.4 只保存新值、使用全局共享数组并固定限制为 10。
- planning session-catchup 找到未同步上下文，但因 GBK 无法输出 `›` 退出；已从现有输出和 Git 状态完成恢复。
- 已将 globalState 历史升级为按规范化 dproj 完整路径索引的映射，并兼容旧版共享数组迁移。
- 成功修改后按“新路径、修改前路径、既有历史”顺序去重保存；配置和平台共享同一项目历史。
- 已新增 `delphiXe7.outputPathHistoryLimit` 整数设置，默认 5，范围 1-15，运行时也执行边界收敛。
- 定向验证通过：dproj 历史与清单测试 11/11，TypeScript 严格检查和 `git diff --check` 通过。
- 更新阶段记录时首次补丁分段标记错误，重新读取锚点后已正确更新，源码未受影响。
- 完整验证通过：44/44 常规测试、3/3 真实 XE7 集成测试、TypeScript 严格检查、esbuild 和 VSIX 打包。
- 重新生成的 `delphi-dcc-builder-0.2.4.vsix` 大小为 609567 字节。
- VSIX SHA-256：`FBEB34B1936750223453A4BA615A3DDBCD34DB2258D4F4681097EAF1AA205DFF`。
- 最终差异范围和 `git diff --check` 通过；本轮未提升版本、未提交或推送。

## 会话：2026-08-04（0.2.5 发布）

### 阶段 15：版本与发布
- **状态：** complete
- 用户要求版本增加 0.0.1，当前 0.2.4 将提升为 0.2.5，随后重新打包、提交并推送。
- 已确认工作区仅包含按项目保存输出路径历史的预期修改，没有未跟踪文件。
- 本轮只更新发布元数据和记录，不修改已经通过 44 项常规测试及 3 项真实 XE7 测试的功能实现。
- 已使用 npm 标准版本命令将 package.json 与 package-lock.json 同步提升到 0.2.5，未创建 Git tag。
- 已将输出路径历史修复从 Unreleased 归入 0.2.5，并更新中英文 README 的当前版本和 VSIX 文件名。
- 完整验证通过：44/44 常规测试、3/3 真实 XE7 集成测试、TypeScript 严格检查、esbuild 和 VSIX 打包。
- 最终 VSIX 为 `delphi-dcc-builder-0.2.5.vsix`，大小 609563 字节，包内 manifest 版本为 0.2.5。
- VSIX SHA-256：`0AD819B9565E99ED9683BC217397110B9CF6F59D6DBF91D451E8E3303B1D0664`。
- 最终版本一致性、完整差异审查和 `git diff --check` 均通过；发布变更提交并推送到 `origin/main`。
