# 任务计划：Delphi XE7 VS Code 编译扩展

## 目标
交付一个可打包的 VS Code 扩展首版，能够从 `.dproj` 生成可审查的 BuildPlan，并通过 DCC32 执行 Build/Rebuild、取消构建和发布诊断。

## 当前阶段
阶段 6：配置与菜单重构（已完成）

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

## 备注
- 本轮不声称完整复现 MSBuild/Delphi IDE；先交付可运行、可校准的垂直切片。
- 做重大决策前重新读取本计划。
