# DelphiBuilder-MCP 中文试用手册

适用分支：`DelphiBuilder-MCP`，永久独立于 `main`，不回合并。当前试用版本：`0.2.20`。

本工具通过 MCP stdio 协议读取 Delphi `.dproj`、生成编译计划、调用 DCC32/DCC64、返回编译日志和诊断，并支持修改指定配置/平台的输出目录和版本。它直接调用 DCC，不是完整 MSBuild，也不是 Delphi IDE 或调试器。

## 1. 试用前准备

- Windows；安装 **Node.js 22 或 24 LTS**。PowerShell 中执行 `node --version` 确认已安装。
- 已合法安装 Delphi 编译器与项目所需库。当前随包提供并实际校准的是 **XE7** 配置；不要将其他 Delphi 版本当作已经支持。
- 有支持本地 stdio MCP 服务的 AI 客户端，并允许该客户端启动本地 Node 进程。
- 先用副本试用，保存 IDE 中未保存的 `.dproj`，备份项目。查询不编译；构建会写产物和部分资源文件；两个修改工具会保存 `.dproj`。
- 服务包不含 Node、Delphi、第三方 Delphi 库或这些软件的授权。不得通过扩展 roots 或更换编译器来绕过信任边界。

## 2. 获取与解压

推荐使用 `release/DelphiBuilder-MCP-0.2.20.zip`。旁边的 `.zip.sha256` 记录 SHA-256，可用以下命令比对：

```powershell
Get-FileHash .\DelphiBuilder-MCP-0.2.20.zip -Algorithm SHA256
Get-Content .\DelphiBuilder-MCP-0.2.20.zip.sha256
Expand-Archive .\DelphiBuilder-MCP-0.2.20.zip -DestinationPath D:\Tools
Set-Location D:\Tools\DelphiBuilder-MCP-0.2.20
```

包内主要文件：

| 路径 | 用途 |
| --- | --- |
| `dist/mcp.js`、`dist/mcp.js.map` | 服务与调试映射；npm 运行依赖已打入 JS |
| `delphi-versions/` | Delphi 编译参数映射，必须与 `dist/` 保持相邻布局 |
| `mcp.config.example.json` | 本机配置模板 |
| `examples/Sample/` | 可复制到可信项目目录的控制台示例 |
| `docs/MCP_TRIAL_GUIDE_CN.md` | 本手册 |
| `skills/delphi-builder-mcp/SKILL.md` | 给 AI 使用的 Skill，也可直接作为提示词 |
| `THIRD-PARTY-NOTICES.txt` | 已打包 npm 依赖的许可与归属 |

**解压试用不需要 `npm install`，不需要 VS Code 或安装 VSIX。** 不要只拷贝一个 `mcp.js`，也不要在生成的 `release/` 目录内保存工作项目或本机配置后重新打包。

如果从源码试用：

```powershell
git switch DelphiBuilder-MCP
npm ci
npm run compile:mcp
```

源码开发者执行 `npm run package:mcp` 会运行类型检查、测试、构建，生成上述 ZIP、解包目录和校验文件。打 ZIP 需要 Windows PowerShell 的 `Compress-Archive`。分发包中的运行目录不包含源码或开发依赖，不能用来再次构建发行包。

## 3. 准备一个隔离试用项目

在解压目录执行：

```powershell
New-Item -ItemType Directory -Force D:\Work\DelphiMcpTrial | Out-Null
Copy-Item .\examples\Sample -Destination D:\Work\DelphiMcpTrial\Sample -Recurse
Copy-Item .\mcp.config.example.json .\mcp.config.json
```

首次复制时，目标 `D:\Work\DelphiMcpTrial\Sample` 应不存在，避免重复复制出嵌套目录。已有项目可直接使用副本，不必使用示例。

编辑 `mcp.config.json`，将编译器路径改为本机实际存在且能正常运行的程序：

```json
{
  "roots": ["D:/Work/DelphiMcpTrial"],
  "compilerPath": "C:/Program Files (x86)/Embarcadero/Studio/15.0/bin/DCC32.exe",
  "compiler64Path": "C:/Program Files (x86)/Embarcadero/Studio/15.0/bin/DCC64.exe",
  "version": "XE7",
  "resourceBuild": true,
  "outputEncoding": "system"
}
```

- `roots` 必须存在；只填愿意让编译器读取/写入的可信项目目录，不要填整个磁盘。项目主源、资源与已识别的输出路径必须在 roots 内，外部库搜索路径可以保留。
- 只试 Win32 时可删除 `compiler64Path`。仅查询项目可以不设置编译器，但编译计划和编译要求对应平台的路径。
- JSON 路径用 `/`，或将反斜杠写为 `\\`。配置接受带或不带 BOM 的 UTF-8。
- 配置中的相对 roots、编译器路径相对于**配置文件**；工具中的相对 `projectFile` 相对于**第一个 root**；相对输出路径相对于 **`.dproj` 所在目录**。
- 可选项：`rsvarsPath`、`brcc32Path`、`additionalArguments`、`environment`。这些只能在受信的本机配置中指定，不能通过工具参数覆盖。
- 编译输出乱码可将 `outputEncoding` 改为 `cp936` 或 `utf8`；它只控制输出解码，不会转换源文件编码。
- 修改服务配置后，重启客户端中的该 MCP 服务。不要修改 Delphi 安装文件来适配服务。

## 4. 接入 AI 客户端

以下为常见 `mcpServers` 配置形式；不同客户端的配置入口、键名与工具授权界面不同，按其本地 stdio MCP 配置方式填写。不要覆盖客户端已有的其他服务配置。

```json
{
  "mcpServers": {
    "delphi-builder": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": [
        "D:/Tools/DelphiBuilder-MCP-0.2.20/dist/mcp.js",
        "--config",
        "D:/Tools/DelphiBuilder-MCP-0.2.20/mcp.config.json"
      ]
    }
  }
}
```

`command` 使用本机 `node.exe` 的绝对路径，可通过 `(Get-Command node).Source` 查询。`args` 的两个文件路径也必须按实际位置修改。

客户端应直接启动 Node，**不要使用 `npm run` 启动协议服务**，避免 npm 的提示污染 stdout。手工运行 `node .\dist\mcp.js --config .\mcp.config.json` 后等待输入是正常现象；它不是交互命令行，也没有 HTTP 地址或端口。正常操作由 MCP 客户端发起，不是向终端粘贴下面的 JSON。

连接后应发现七个工具；客户端可能为工具名加服务前缀。让 AI 使用实际发现的工具名，不要硬编码前缀。Skill 安装方式见第 7 节。

## 5. 首次验收：先查询与审阅，再编译

下面按顺序给出工具名与 JSON 参数；在客户端中由 AI 发起调用。

### 5.1 查询项目

工具：`get_project_info`

```json
{"projectFile":"Sample/Sample.dproj","configuration":"Debug","platform":"Win32"}
```

检查返回的 `configuration`、`platform`、`configurations`、`mainSource`、`outputPath`、`warnings`。配置名来自项目，不能自行杜撰。查询不会启动编译器，编译期间也可查询。

### 5.2 审阅编译计划

工具：`get_build_plan`

```json
{"projectFile":"Sample/Sample.dproj","configuration":"Debug","platform":"Win32","rebuild":false}
```

核对 `compilerPath`、`workingDirectory`、`arguments`、资源步骤、`expectedArtifacts` 与 `warnings`。计划不写项目文件、不编译，且不返回继承的环境变量。

本工具不会完整执行 `.dproj` 的任意 MSBuild 导入/自定义任务。有关 `CodeGear.Delphi.Targets` 导入的警告可能出现；`RcItem` 等不能完整模拟的资源必须审阅。不要为了得到“零警告”而隐藏或忽略兼容性风险。

### 5.3 启动异步编译并读完日志

用户明确同意编译后，工具：`start_build`

```json
{"projectFile":"Sample/Sample.dproj","configuration":"Debug","platform":"Win32","rebuild":false}
```

该调用只返回实际的 `jobId` 和初始状态，**不代表编译成功**。将这个 ID 原样传给 `get_build_status`：

```json
{"jobId":"替换成上一步实际返回的ID","offset":0,"limit":16384}
```

之后保持同一个 ID，将返回的 `nextOffset` 用作下次 `offset`：

- `queued`、`running` 不是终态。低频查询，避免无输出时连续忙轮询；不要因为一页日志为空就重启任务。
- 终态为 `succeeded`、`failed`、`cancelled`。
- 即使已终态，也要继续读取，直到 `nextOffset === totalLength`，才算读完全部日志。
- 偏移与上限按 JavaScript **UTF-16 代码单元**计数；不要按字节或 Unicode 码点自己累加。`limit` 范围为 1–65536。
- `warnings` 是计划警告；`diagnostics` 是结构化编译诊断；准备失败可有 `error`。
- 不能仅凭 `existingArtifacts` 非空判断成功：它可能包含上次编译的旧产物。应以终态、`result`、诊断和完整日志共同判断。

示例应编译为控制台 EXE。服务**不会运行 EXE**。用户额外授权后，才可以在终端运行返回的确切 EXE 路径，预期输出为 `Delphi XE7 build smoke test`。`rebuild:true` 为重新编译；Win64 要先配置有效的 `compiler64Path`。

## 6. 修改与取消的试用

### 修改输出目录

用户明确指定修改范围后，工具：`set_output_path`

```json
{"projectFile":"Sample/Sample.dproj","configuration":"Debug","platform":"Win32","outputPath":"bin/$(Platform)/$(Config)"}
```

再用相同配置/平台查询和生成计划，核对新目录。修改会保存 `.dproj`，只针对所选范围。路径必须位于 roots 内。

`$(Config)`、`$(Platform)` 等可解析表达式会保留。`$(DCC_ExeOutput)/nested` 表示在**修改前**的有效目录上追加一次；重复执行这种修改会再次追加，因此不得把它当作可安全重试的幂等操作。查询不会再次追加。

### 修改项目版本

工具：`set_project_version`

```json
{"projectFile":"Sample/Sample.dproj","configuration":"Debug","platform":"Win32","version":"1.2.3.4"}
```

允许 1–4 段十进制数字，每段 0–65535，不足四段会规范化；改后查询核对。修改不会立即编译或修补旧 EXE。

下一次启用资源处理的构建，只有主源包含工具可识别的 `{$R *.res}` 项目资源时，才会同步生成 EXE/DLL 的版本资源。**随包控制台 Sample 没有该指令**，在它上面只能验收项目版本修改，不能据此声称 EXE 版本已更新。已有项目的条件公司名、版权等非版本元数据会保留。

### 取消

有 `jobId` 后调用 `cancel_build`，参数为 `{"jobId":"实际任务ID"}`，随后继续查询至终态并读完日志。快速编译可能在取消到达前已经成功；对已终态的任务取消不会重开任务。

`start_build` 请求处理期间收到协议取消通知，会停止待启动流程或取消刚创建的任务；收到 ID 后优先用明确的 `cancel_build`。取消在准备、资源与 DCC 阶段间生效，并终止 Windows 活动子进程树；已经完成的文件写入不回滚。

同一项目的修改和构建互斥；不同项目可以并行。不要为了绕过 `Project is busy` 启动第二个服务实例。

## 7. 交给 AI 的 Skill

文件：[skills/delphi-builder-mcp/SKILL.md](../skills/delphi-builder-mcp/SKILL.md)。

- 支持 `SKILL.md` 的客户端：将整个 `delphi-builder-mcp` 目录复制到该客户端规定的技能目录，保留文件名与 YAML 头。该文件是客户端指令，不是新的 MCP 服务；仅安装 Skill 不会自动连接 MCP。
- 例如支持该约定的 Claude Code，可使用项目级 `.claude/skills/delphi-builder-mcp/SKILL.md`；其他客户端以其实际技能目录为准。
- 不支持 Skill：将该文件正文粘贴到对话或项目指令中，MCP 仍按第 4 节单独配置。

连接服务并载入指令后，可以提出以下请求：

> 仅查询 Sample/Sample.dproj 的 Debug/Win32 配置和编译计划，说明输出位置与警告，先不要编译或修改文件。

> 允许将上述项目的 Debug/Win32 输出路径改为 bin/$(Platform)/$(Config)，核对后编译。读完所有日志并报告真实终态、诊断和产物路径；不要运行 EXE。

> 取消刚才的编译任务，等待终态并报告是否仍有已生成文件。

## 8. 常见问题

| 现象 | 处理 |
| --- | --- |
| 连接后退出或没有七个工具 | 看客户端服务 stderr；核对 node.exe、绝对路径、JSON 格式、roots 是否存在，以及 `delphi-versions/` 布局。不要把等待 stdin 当作故障 |
| `No compiler configured` 或编译器文件不存在 | 在本机配置中填写对应平台的实际编译器路径并重启服务 |
| DCC 启动器报告缺少其内部编译器 | 修复本机 Delphi 安装或显式指向已知可用的合法编译器；不要让 AI 擅自改名/覆盖安装文件 |
| `outside configured project roots` | 检查主源、资源、输出路径和符号链接；将试用项目移到受信目录，必要时由用户审阅后调整 roots，不能靠遍历路径绕过 |
| `Project is busy` | 等同一项目的构建/修改完成；需要取消时先请求取消并等待终态 |
| 修改被拒绝，提示 UTF-8 或源文件变化 | 保存并关闭冲突的编辑操作；先备份、由用户决定编码转换。不要重试覆盖外部修改 |
| 输出乱码 | 按实际 DCC 输出编码选择 system/cp936/utf8 并重启；不修改源代码编码来掩盖输出问题 |
| `Unknown build job` | 服务重启后 ID 失效；仅保留当前进程最近完成的 50 个任务，不能跨会话续查 |
| EXE/DLL 已存在但任务 failed | 很可能是旧产物；检查 `result`、诊断与完整日志，不宣称本次构建成功 |

roots 是应用层限制，不是操作系统沙箱；可信源码、库、编译器仍可执行其自身行为。任务和日志存于内存，关闭 stdin 或服务退出会取消活动构建并等待清理；不要在编译中强杀服务或断电。长日志可能消耗较多内存。
