## 🤖 Assistant

以下按 **VS Code 扩展**规划，不是 Visual Studio 扩展。扩展最终打包为 `.vsix`，只支持 Windows、Delphi XE7/BDS 15.0 和 DCC32。

# VS Code Delphi DCC Builder 扩展开发手册

版本：规划稿 v0.1  
建议扩展名：`delphi-xe7-build`  
首要目标：传入 `.dproj`，直接调用 `DCC32.exe`，复现 XE7 IDE 的编译参数、工作目录、库路径和产物位置，并将错误显示到 VS Code Problems 面板。

## 1. 第一版范围

第一版必须支持：

| 功能 | 要求 |
|---|---|
| 项目入口 | `.dproj`，并自动定位对应 `.dpr` |
| 编译器 | Delphi XE7 `DCC32.exe` |
| 平台 | Win32 |
| 配置 | Debug、Release 以及项目自定义配置 |
| 编译方式 | 直接启动 DCC32，不通过 MSBuild |
| 编译命令 | Build、Rebuild、Cancel、Show Build Plan |
| 诊断 | Error、Fatal、Warning、Hint |
| 结果展示 | Output Channel、Problems、成功/失败通知 |
| 输出目录 | 使用 `.dproj` 中的 EXE、DCU、BPL、DCP、MAP 配置 |
| IDE 环境 | 读取 BDS 15.0 注册表、环境变量和 Library Path |
| 编码 | 支持 CP936/GBK、系统代码页和 UTF-8 |

第一版暂不承诺：

- `.groupproj` 多项目依赖构建
- Win64/DCC64
- Android、iOS 等平台
- 部署、签名和安装包生成
- 任意自定义 MSBuild Targets
- 自动执行未经确认的编译前、编译后脚本

## 2. 用户操作流程

资源管理器右键 `.dproj`：

```text
Delphi DCC Builder: Build Project
Delphi DCC Builder: Rebuild Project
Delphi DCC Builder: Show Build Plan
```

命令面板执行时：

1. 优先使用当前打开的 `.dproj`
2. 其次使用工作区设置中的默认项目
3. 工作区存在多个项目时弹出项目选择列表
4. 读取项目支持的 Config 和 Platform
5. 生成 Build Plan
6. 调用 DCC32
7. 将错误写入 Problems
8. 显示成功、失败、耗时和产物位置

还应注册可由其他扩展调用的命令：

```ts
vscode.commands.executeCommand("delphiXe7.buildProject", {
  project: "D:\\Company\\App\\App.dproj",
  configuration: "Debug",
  platform: "Win32"
});
```

## 3. 一致性标准

“与 XE7 IDE 编译一致”不能只用“编译成功”判断。必须验证：

- 使用相同的 `DCC32.exe`
- 工作目录是 `.dproj` 所在目录
- 配置和平台相同
- `-U`、`-I`、`-R`、`-O` 路径内容和顺序相同
- 条件编译符号相同
- Namespace、Runtime Packages 和 Unit Alias 相同
- EXE、DCU、BPL、DCP、MAP 输出目录相同
- 编译开关与 XE7 项目选项一致
- 使用的同名 PAS/DCU 文件来源一致

搜索路径的顺序必须保持不变。只要顺序不同，就可能引用另一个同名单元，即使最终仍然编译成功。

## 4. 核心架构

扩展 UI 与编译逻辑分离，核心输出统一的 `BuildPlan`：

```ts
interface BuildPlan {
  projectFile: string;
  mainSource: string;
  compilerPath: string;
  workingDirectory: string;
  configuration: string;
  platform: "Win32";
  environment: Record<string, string>;
  arguments: string[];
  expectedArtifacts: string[];
  warnings: string[];
}
```

执行链路：

```text
VS Code Command
  -> ProjectResolver
  -> DprojEvaluator
  -> BdsEnvironmentResolver
  -> DccArgumentBuilder
  -> BuildPlan
  -> CompilerRunner
  -> DiagnosticParser
  -> Problems / Output / Notification
```

`BuildPlan` 必须可查看、可测试、可序列化。以后开发 CLI 或 MCP 时，可以直接复用该核心。

## 5. 项目解析规则

`.dproj` 解析器需要完成：

1. 读取 `MainSource` 并定位 `.dpr` 或 `.dpk`
2. 按 XML 中的实际顺序处理 `PropertyGroup`
3. 处理 Config、Platform、Base 和 CfgParent 继承
4. 支持常用 Condition：`==`、`!=`、`and`、`or`、括号
5. 展开 `$(Config)`、`$(Platform)`、`$(BDS)` 等属性
6. 递归展开属性并检测循环引用
7. 保留搜索路径原有顺序
8. 将相对路径基于 `.dproj` 目录解析
9. 对未知或未支持的 DCC 属性发出警告

Condition 不应通过 `eval()` 执行，应实现受限的表达式解析器，避免项目文件变成任意代码执行入口。

配置来源按以下顺序合并：

```text
系统环境变量
-> XE7/BDS 环境变量
-> XE7 Win32 Library Path
-> .dproj 基础配置
-> 平台配置
-> Debug/Release 配置
-> Debug/Release + Win32 配置
-> VS Code 用户覆盖配置
```

实际覆盖语义必须通过真实 XE7 项目和 IDE 命令行校准，不能只依赖字段名猜测。

## 6. XE7 环境发现

默认从注册表定位：

```text
HKLM\Software\Embarcadero\BDS\15.0
HKCU\Software\Embarcadero\BDS\15.0
HKCU\Software\Embarcadero\BDS\15.0\Library\Win32
HKCU\Software\Embarcadero\BDS\15.0\Environment Variables
```

同时查询 32 位注册表视图。优先级为：

```text
delphiXe7.compilerPath 设置
-> BDS 15.0 注册表 RootDir
-> 常见 XE7 安装目录
```

编译前至少检查：

- `DCC32.exe` 是否存在
- `.dpr` 是否存在
- 搜索路径宏是否全部展开
- 必需输出目录是否可创建
- Runtime Package 路径是否有效
- 项目目录附近是否存在 `.cfg`
- 当前配置是否确实支持 Win32

`.cfg` 的读取优先级和覆盖规则需要使用 XE7 实机验证，不能默认忽略，也不能重复添加其中已经存在的参数。

## 7. DCC32 执行

必须用参数数组启动进程：

```ts
spawn(compilerPath, buildPlan.arguments, {
  cwd: buildPlan.workingDirectory,
  env: buildPlan.environment,
  shell: false,
  windowsHide: true
});
```

其中：

- Build 使用项目正常增量编译行为
- Rebuild 增加 `-B`
- stdout/stderr 以 Buffer 接收后再解码
- Cancel 只终止本次编译器及其子进程
- 同一个项目同一时间只允许一个编译任务
- 不通过 `cmd.exe` 拼接整段命令

编译前后事件第一版默认禁用。后续支持时，必须要求 Trusted Workspace，并提供 `disabled`、`prompt`、`enabled` 三种策略。

## 8. 错误与结果展示

解析以下常见格式：

```text
MainForm.pas(128) Error: E2003 Undeclared identifier: 'CustomerId'
MainForm.pas(24) Warning: W1036 Variable might not have been initialized
Project.dpr(1) Fatal: F2613 Unit 'Xxx' not found
[dcc32 Error] Unit1.pas(42): E2010 Incompatible types
```

每条诊断转换为 `vscode.Diagnostic`，支持：

- Problems 面板显示
- PAS 文件内波浪线
- 单击跳转到对应行
- Error/Fatal、Warning、Hint 不同级别
- 每次构建前清理该项目旧诊断
- 无法定位文件时仍保留在 Output Channel

成功通知示例：

```text
Delphi build succeeded in 4.2s: D:\Company\Bin\App.exe
```

失败通知示例：

```text
Delphi build failed: 3 errors, 7 warnings
```

## 9. 建议目录结构

```text
delphi-xe7-build/
  src/
    extension.ts
    commands/
    project/dprojParser.ts
    project/conditionEvaluator.ts
    project/propertyResolver.ts
    environment/bdsLocator.ts
    environment/registryReader.ts
    compiler/buildPlan.ts
    compiler/dccArgumentBuilder.ts
    compiler/compilerRunner.ts
    compiler/diagnosticParser.ts
    compiler/artifactLocator.ts
    vscode/diagnosticPublisher.ts
  test/
    fixtures/
    unit/
    integration/
  package.json
  tsconfig.json
  esbuild.mjs
```

建议依赖：

```text
TypeScript
esbuild
fast-xml-parser（启用 preserveOrder）
iconv-lite
Vitest
@vscode/test-electron
@vscode/vsce
```

注册表查询优先封装 Windows 自带的 `reg.exe`，避免引入难以打包的原生 Node 模块。

## 10. 开发阶段

**阶段 0：收集真实基准**

准备脱敏后的 `.dproj`、`.dpr`、关联 `.cfg`、XE7 完整 DCC32 命令行、注册表 Library Path，以及 Debug/Release 各一次产物位置。

**阶段 1：扩展骨架**

完成命令注册、右键菜单、项目选择、Output Channel、状态栏和 `.vsix` 打包。

**阶段 2：Build Plan**

完成 dproj、配置继承、宏、注册表和 DCC 参数解析。此阶段先不编译，只实现 `Show Build Plan`，与 XE7 命令逐项比较。

**阶段 3：编译与诊断**

接入 DCC32、取消操作、编码识别、Problems 面板、成功/失败通知和产物检测。

**阶段 4：一致性强化**

补充 Runtime Packages、BPL/DCP、`.cfg`、自定义配置、编译前后事件以及异常项目结构。

**阶段 5：交付**

执行真实项目回归，生成公司内部 `.vsix`，编写安装、配置、故障排查和版本升级说明。

## 11. 测试与验收

测试分为三层：

- 单元测试：XML、Condition、属性继承、宏、路径顺序、诊断文本解析
- 集成测试：使用假的 DCC32 程序模拟成功、失败、乱码、取消和长时间运行
- XE7 实机测试：对照 IDE 的完整命令行和实际产物目录

第一版完成标准：

```text
右键任意已支持的 .dproj 可以编译
Debug/Release 配置解析正确
DCC32 工作目录和参数与 IDE 基准一致
错误可以点击并跳转到 PAS 行
编译成功能定位实际 EXE/DLL/BPL
中文路径和错误信息不乱码
未知配置不会被静默忽略
扩展可打包并离线安装为 .vsix
```

正式开始开发时，应从“阶段 0”开始。最关键的输入是一套真实项目样本和 XE7 的完整 DCC32 命令行；它们决定插件是在真实复现 IDE，还是仅仅碰巧把项目编译通过。
