# 任务计划：Delphi XE7 VS Code 编译扩展

## 目标
交付一个可打包的 VS Code 扩展首版，能够从 `.dproj` 生成可审查的 BuildPlan，并通过 DCC32 执行 Build/Rebuild、取消构建和发布诊断。

## 当前阶段
阶段 15：0.2.5 发布（完成）

## 各阶段

### 阶段 1：基线与工程骨架
- [x] 阅读规划并确认第一版边界
- [x] 检查本机 Node/npm/VS Code 工具链
- [x] 创建 TypeScript 扩展工程与打包配置
- **状态：** complete

### 阶段 2：BuildPlan 核心
- [x] 实现 dproj XML 读取、配置发现与属性求值
- [x] 实现 XE7/DCC32 定位和参数生成
- [x] 实现 Show Build Plan
- **状态：** complete

### 阶段 3：编译与 VS Code 集成
- [x] 实现 Build/Rebuild/Cancel
- [x] 实现输出解码、诊断解析与 Problems 发布
- [x] 注册命令、菜单和配置项
- **状态：** complete

### 阶段 4：测试与打包
- [x] 添加单元测试和 dproj fixture
- [x] 执行类型检查、测试、打包和 VSIX 生成
- [x] 修复验证问题并记录结果
- **状态：** complete

### 阶段 5：交付
- [x] 检查生成物和文档
- [x] 说明真实 XE7 校准所需输入
- **状态：** complete

### 阶段 6：配置与菜单重构
- [x] 初始化本地 Git 仓库并提交 `0.1.4` 基线
- [x] 确认 VS Code 右键菜单动态配置能力与配置选择方案
- [x] 将 DCC 路径改为显式必填，移除默认项目和默认配置
- [x] 按 dproj 实际配置提供 Build Quick Pick 并强制使用传入配置
- [x] 评估并精简 Rebuild 菜单
- [x] 增加默认隐藏的 Show Build Plan 菜单设置
- [x] 更新测试、文档、版本并完成打包验证
- **状态：** complete

### 阶段 7：XE7 DCC 参数一致性修复
- [x] 按 XE7 官方 DCC task 元数据修正 Debug/Release 编译参数映射
- [x] 读取并注入 Win32 Debug DCU Path，禁用 dcc32.cfg 隐式参数
- [x] 增加参数与环境解析回归测试
- [x] 更新 0.2.1 版本、文档与变更日志
- [x] 执行类型检查、常规测试、XE7 实机测试和 VSIX 打包
- [x] 审查差异、校验规划记录并提交 Git commit
- **状态：** complete

### 阶段 8：XE7 资源搜索路径修复
- [x] 对照 XE7 Targets 和真实 Build Plan 确认 `-R` 路径语义
- [x] 修复 VCL、FireDAC `.res/.dfm` 资源搜索路径生成
- [x] 增加资源路径参数回归测试
- [x] 更新补丁版本、文档和变更日志
- [x] 执行类型检查、常规测试、XE7 实机测试和 VSIX 打包
- [x] 审查差异并创建可回退的 Git commit
- **状态：** complete

### 阶段 9：Delphi DCC Builder 品牌重命名
- [x] 盘点扩展清单、运行时和文档中的用户可见旧名称
- [x] 将包名和可见品牌统一为 Delphi DCC Builder
- [x] 保留 `delphiXe7.*` 命令与配置键兼容性
- [x] 更新清单回归测试并保持版本 0.2.2
- [x] 执行检查、测试、打包及 VSIX 内容验证
- [x] 审查差异、提交并同步远程仓库
- **状态：** complete

### 阶段 10：Delphi XE7 品牌与 Win64 构建支持
- [x] 将包名和全部用户可见品牌改为 Delphi XE7 DCC Builder
- [x] 增加可选 DCC64 路径配置和 Win64 平台构建链路
- [x] 仅在 DCC64 路径非空时显示 Win64 右键构建命令
- [x] 增加清单、平台、环境路径和参数回归测试
- [x] 更新中英文文档与变更日志，保持版本 0.2.2
- [x] 执行类型检查、测试、打包和 VSIX 内容验证
- [x] 审查差异并提交同步远程仓库
- **状态：** complete

### 阶段 11：0.2.3 发布
- [x] 将 package.json 与 package-lock.json 版本提升到 0.2.3
- [x] 更新 Changelog 和 README 当前版本/VSIX 文件名
- [x] 执行完整检查、测试、打包和 VSIX 内容校验
- [x] 审查差异，提交并推送 main
- **状态：** complete

### 阶段 12：输出路径编辑菜单
- [x] 使用 codebase-memory-mcp 完整初始化当前项目索引
- [x] 增加英文 `Change Output Path` 命令和 `.dproj` 右键菜单
- [x] 实现当前路径预填、历史路径选择和历史持久化
- [x] 按选定配置与平台局部更新 `DCC_ExeOutput` 并保持 XML 格式/编码
- [x] 增加清单、历史记录、dproj 更新和配置隔离测试
- [x] 更新中英文文档并完成类型检查、测试和打包验证
- **状态：** complete

### 阶段 13：0.2.4 发布
- [x] 同步提升 package.json 与 package-lock.json 到 0.2.4
- [x] 将输出路径功能归入 0.2.4 Changelog 并更新中英文 README
- [x] 执行类型检查、常规测试、XE7 实机测试和 VSIX 打包
- [x] 审查差异、提交并推送 origin/main
- **状态：** complete

### 阶段 14：按项目保存输出路径历史
- [x] 将修改前后的输出路径同时纳入历史，保持最近使用优先和大小写不敏感去重
- [x] 按规范化 `.dproj` 完整路径隔离历史，不同配置和平台共享同一项目历史
- [x] 增加默认 5、范围 1-15 的 `outputPathHistoryLimit` 设置
- [x] 增加历史隔离、旧值保留、数量限制和清单回归测试
- [x] 更新中英文文档并完成类型检查、测试和打包验证
- **状态：** complete

### 阶段 15：0.2.5 发布
- [x] 同步提升 package.json 与 package-lock.json 到 0.2.5
- [x] 将输出路径历史修复归入 0.2.5 Changelog 并更新中英文 README
- [x] 执行完整检查、真实 XE7 测试和 VSIX 打包
- [x] 审查差异、提交并推送 origin/main
- **状态：** complete

## 关键问题
1. 真实 XE7 `.dproj` 的属性覆盖和 DCC 参数需由脱敏样本与 IDE 命令行校准。
2. 本地 Git 仓库已建立；`76ed7b4` 是 0.1.4 可还原基线。

## 已做决策
| 决策 | 理由 |
|------|------|
| 首版使用 TypeScript + esbuild + Vitest | 与原规划一致，依赖成熟且便于打包 |
| 核心逻辑与 VS Code API 分离 | BuildPlan 可单测，后续可复用到 CLI |
| 对未支持的 dproj 内容发出警告 | 避免静默产生与 IDE 不一致的构建 |
| 右键使用单个 Build Project... + 配置 Quick Pick | VS Code 菜单清单不能根据 dproj 或配置数组动态生成标题和数量 |
| Rebuild 仅从右键菜单移除 | `-B` 对清理陈旧 DCU 仍有价值，保留命令面板入口 |
| DCC 参数以 XE7 自带 `dcctask.xml` 为准 | 避免把 `DCC_DebugDCUs` 错映射成 `-V`，导致 Release 产物携带调试信息 |
| 禁用 `dcc32.cfg` 后显式生成完整 `-R` | 保证 Build Plan 与实际资源查找路径一致，避免 VCL/FireDAC 资源依赖隐式配置 |
| 对外品牌重命名但保留 `delphiXe7.*` 标识 | 避免已有工作区设置、命令调用和菜单条件失效 |
| DCC32 必填、DCC64 可选并使用独立 Win64 命令 | 保持现有 Win32 工作流兼容，同时让右键菜单可由空字符串配置静态控制 |
| 输出路径编辑使用可编辑 Quick Pick 和按 dproj 隔离的最近历史 | 同一弹窗满足当前值输入与历史选择，同时避免不同项目相互污染 |
| 历史键使用规范化 dproj 完整路径 | 只用文件名会让不同目录下的同名项目错误共享记录 |
| 为配置与平台写入精确的 `DCC_ExeOutput` 覆盖组 | 避免修改 Base 后意外影响 Debug、Release 或另一平台 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 目录不是 Git 仓库 | 1 | 不执行 Git 相关操作；按用户明确授权创建工程 |
| 未定义配置键在 Condition 中被当成非空文本 | 1 | Condition 专用求值将未定义 MSBuild 属性展开为空字符串 |
| VS Code 通知按钮参数不接受 undefined | 1 | 按是否有产物拆分为两个 API 调用 |
| XE7 集成测试发现 BDSLIB/BDSCOMMONDIR 未展开 | 1 | 解析 rsvars.bat、派生 BDSLIB，并按层次展开环境变量 |
| 本机 DCC32 启动器缺少 dcc32compiler.exe | 1 | 不修改安装目录；集成测试通过 compilerPath 使用 DCC32.EXE.old |
| 真实 DCC32 错误前含裸回车进度记录 | 1 | 诊断解析按 CR 或 LF 分割记录 |
| 完成状态批量更新未匹配进度文件文字 | 1 | 重新读取计划文件后按实际内容精确更新 |
| `git diff --stat` 提示不是 Git 仓库 | 1 | 用户已明确要求建立本地 Git 基线，下一步执行 `git init` |
| planning skill 的 `check-complete.ps1` 编码损坏导致解析失败 | 1 | 改用同技能提供的 `check-complete.sh` 备用脚本 |
| PowerShell PATH 中没有 `sh` | 1 | 已定位 `C:\Program Files\Git\bin\bash.exe`，改用绝对路径运行备用脚本 |
| 误读不存在的集成测试 fixture 路径 | 1 | 确认真实集成测试复用 `test/fixtures/Sample.dproj`，不重复该路径 |
| DCC64 集成测试发现 `$(BDSUSERDIR)` 未展开 | 1 | 查询 XE7 环境来源并在 BDS 环境层补齐，不移除集成断言 |
| session-catchup.py 在 GBK 控制台输出 `›` 时失败 | 1 | 从已输出内容和 Git 状态恢复上下文，记录后继续，不重复运行同一失败命令 |
| 阶段记录补丁的文件分段标记错误 | 1 | 读取实际锚点后改用两个明确文件分段，源码未受影响 |

## 备注
- 本轮不声称完整复现 MSBuild/Delphi IDE；先交付可运行、可校准的垂直切片。
- 做重大决策前重新读取本计划。
