# 发现与决策

## 需求
- Windows-only VS Code 扩展，目标 Delphi XE7/BDS 15.0、DCC32、Win32。
- 从 `.dproj` 生成 BuildPlan，支持 Build、Rebuild、Cancel、Show Build Plan。
- 编译输出进入 Output Channel，诊断进入 Problems 面板。
- 搜索路径顺序、配置继承、宏、输出目录和编码是兼容性重点。

## 研究发现
- 当前工作区只有 `VS Code规划.md`，尚无代码，也不是 Git 仓库。
- codebase memory 仅索引到该规划文档，没有既有实现可复用。
- 最大风险是绕过 MSBuild 后自行复现 `.dproj` 求值和 DCC task 参数映射。
- 本机已安装 Node 24.14.0、npm 11.19.0 和 VS Code 1.131.0，可直接开发、测试和打包扩展。
- 代码库记忆索引尚未包含新源码，打包前审查改用 `rg` 和 VSCE 文件清单。
- 所有外部进程均使用参数数组和 `shell:false`；未发现 eval、cmd 拼接或待办占位。
- Delphi 项目常通过 `$(DCC_UnitSearchPath)` 继承全局路径，因此注册表 Library Path 必须在 dproj 求值前注入。
- 本机 BDS 15.0 安装在 `D:\Program Files (x86)\Embarcadero\Studio\15.0`，可执行真实 XE7 集成测试。
- Win32 Library Path 含 BDS 与第三方 `$(...)` 宏，必须在 `%VAR%` 展开后继续执行大小写不敏感的 MSBuild 属性展开。
- `rsvars.bat` 是 BDSCOMMONDIR 的权威来源；BDSLIB 由 RootDir 下的 `lib` 派生。
- 注册表环境变量 `Path` 使用 `$(path)` 继承前值，环境必须按系统、rsvars、注册表、用户覆盖逐项求值。
- 本机默认 DCC32.exe 是依赖缺失 dcc32compiler.exe 的启动器；DCC32.EXE.old 是可执行的原编译器，需通过 compilerPath 覆盖测试。
- XE7 DCC32 用裸 CR 刷新编译进度，诊断解析必须同时把 CR 和 LF 视为记录边界。
- XE7 自带 dcc32.cfg 含 Unit Alias 和全局搜索路径；BuildPlan 必须披露该隐式参数来源。
- 当前实现已迭代到 0.1.4，真实项目校准修复了自引用属性、运行时包条件、Include Path、全局 Fatal 诊断和完成状态栏清理。
- 本轮用户要求 DCC 路径显式配置，不再自动发现；移除默认项目和默认配置，右键构建必须带明确配置。
- VS Code 清单菜单是静态声明，不能在右键打开时按当前 `.dproj` 内容动态新增任意菜单项；需要用预声明命令、子菜单或单个命令内 Quick Pick 实现。
- `.gitignore` 已排除 `node_modules/`、`dist/`、`*.vsix` 和测试输出，适合直接建立源码基线；本机 Git 用户身份已配置。
- 基线暂存包含 43 个源码/测试/文档文件；`VS Code规划.md` 有两处既有行尾空格，按最小改动原则保留。
- `resolveConfiguration` 对命令传入配置会直接交给 dproj 求值器校验并应用；删除默认配置设置后，可保留该强制语义。
- 没有命令传入配置时，右键命令读取 `BuildConfiguration`，排除 Base；多个配置用 Quick Pick，单个直接使用，零个明确报错而不假定 Debug。
- `config.<setting>` 可用于静态菜单 `when` 条件，因此 `showBuildPlanMenu` 可以用 hide/show 枚举控制；Rebuild 从 explorer/context 删除但命令继续贡献。
- DCC 路径校验应在创建 Build Plan 前读取 resource-scoped `compilerPath` 并拒绝空字符串；注册表仍用于 XE7 环境和 Library Path，不再用于替用户选择编译器。
- README 仍描述编译器自动发现、defaultProject/defaultConfiguration 和三个右键命令，需要与 0.2.0 行为同步；英文 README 也需改为 compilerPath 必填和配置 Quick Pick。
- 0.2.0 完整验证通过 25 项常规测试和 2 项真实 XE7 集成测试；VSIX 打包成功，repository/LICENSE 警告是上架前元数据事项，不阻塞本轮功能。
- 同事的 Release Build Plan 出现 `-$L+ -V -GD`，其中 `-V` 来自插件把 `DCC_DebugDCUs=true` 错映射为编译开关，是产物接近 Debug 体积的主要原因。
- XE7 官方 `dcctask.xml` 定义：`DCC_DebugInformation=0/1/2` 对应 `-$D0/1/2`，`DCC_SymbolReferenceInfo=0/1/2` 对应 `-$Y-/-$YD/-$Y+`，`DCC_DebugInfoInExe=true` 对应 `-V -VN`。
- `DCC_DebugDCUs` 本身不产生开关；为 true 时应把 Delphi Debug DCU 路径前置到 Unit Search Path。
- 官方优化属性名是 `DCC_Optimize`，不是当前实现使用的 `DCC_Optimization`；为避免本机 `dcc32.cfg` 污染结果，每次构建都应传 `--no-config`。
- 固定传入 `--no-config` 后，原先“DCC32 may load implicit compiler arguments”警告不再成立，应同时移除 Build Plan 的 `.cfg` 探测，避免误导。
- VSCE 默认会打包未被 `.vscodeignore` 排除的未跟踪文件；本轮已排除 `Untitled-*.json` 并显式将 `README_CN.md` 纳入 VSIX。
- 用户业务项目在 0.2.1 下集中报 `Controls.res`、`midas.res`、VCL/FireDAC `.dfm` 找不到；现有实现只把完整 Unit Search Path 传给 `-U/-I`，`-R` 仅使用显式 `DCC_ResourcePath`，这是当前首要排查点。
- XE7 `CodeGear.Delphi.Targets` 第 132-138 行明确构造 ResourcePath：`DCC_TranslatedResourcePath`、`BRCC_OutputDir`、`DCC_UnitSearchPath`、`DCC_ResourcePath`、`DelphiLibraryPath`；当前插件没有复现这段逻辑。
- 用户提供的 0.2.0 Build Plan 参数包含完整 `-U/-I`，但没有任何 `-R`；本机 `dcc32.cfg` 也只有 Unit Alias 和 `-U`，所以不能依赖恢复 cfg 解决资源查找，必须显式生成 `-R`。
- 本机 XE7 的 `lib\\win32\\release` 实际包含 `midas.res`、`CategoryButtons.res` 和 FireDAC VCLUI `.dfm` 等资源，证明将全局 Delphi Library Path 纳入 `-R` 可直接解决同类错误。
- 0.2.2 已按官方顺序生成显式 `-R`，同时保留 `--no-config`；无需在“构建可复现”和“资源可找到”之间二选一。

## 技术决策
| 决策 | 理由 |
|------|------|
| 使用 fast-xml-parser 的 preserveOrder 模式 | PropertyGroup 顺序会影响 MSBuild 属性覆盖结果 |
| 使用参数数组和 shell:false 启动 DCC32 | 避免 shell 注入和 Windows 引号拼接问题 |
| 使用 iconv-lite 解码编译器 Buffer 输出 | XE7 输出可能使用 CP936/系统代码页 |
| 注册表通过 reg.exe 查询 | 避免原生 Node 模块影响 VSIX 打包 |
| Debug DCU Path 从 BDS 15.0 `Library\\Win32` 注册表读取 | 与 IDE/XE7 Targets 的环境来源保持一致 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 缺少真实 XE7 基准项目 | 用 fixture 验证确定性逻辑，并把未校准项作为警告和后续输入 |
| 首次真实 XE7 测试发现 BDSLIB/BDSCOMMONDIR 未展开 | 增加 rsvars 解析及分层环境求值后重试 |
| 默认 DCC32.exe 无法启动其内部编译器 | 保留安装目录原状，以 compilerPath 覆盖到 DCC32.EXE.old 继续验证 |
| 真实错误未被正则匹配 | 原始格式含裸 CR 进度记录；解析前按 CR/LF 拆分 |
| 当前目录没有 Git 历史 | 本轮按用户明确要求初始化本地仓库并先提交 0.1.4 基线 |

## 资源
- `VS Code规划.md`
- 本机 BDS 15.0 注册表和 DCC32，用于实机校准。

## 视觉/浏览器发现
- 本任务当前无需浏览器或视觉检查。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
