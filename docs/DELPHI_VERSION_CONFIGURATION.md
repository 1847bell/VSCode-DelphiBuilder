# Delphi 版本配置文件开发手册

本文说明如何为 Delphi DCC Builder 增加一个新的 Delphi 版本，以及如何判断某个编译器差异是否可以只通过 JSON 配置表达。目标读者是希望为其他 Delphi/BDS 版本贡献支持的开发者。

本文以仓库中的 `delphi-versions/XE7.json` 为参考实现。新增版本时，建议先完整阅读本文，再复制 XE7 配置进行修改。

## 1. 设计目标

扩展的构建流程分为两层：

```text
通用 TypeScript 构建流程
    + 读取 delphi-versions/<version>.json
    + 读取 .dproj 和 BDS 注册表环境
    + 按配置文件生成 DCC 参数
    + 执行 DCC32/DCC64
```

版本配置文件负责描述版本之间稳定、可枚举的差异，例如：

- BDS 注册表版本和 Studio 安装目录版本；
- DCC32/DCC64 文件名；
- VS Code 中保存编译器路径的设置名称；
- 基础参数、Rebuild 参数和路径开关；
- `.dproj` 属性到 DCC 参数的映射；
- 布尔值和枚举值的参数规则。

版本配置文件不负责描述任意 MSBuild 行为。扩展不会执行 `.dproj` 中导入的 MSBuild `Import`、自定义 `Target`、编译前脚本或编译后脚本。

如果新编译器的差异可以归纳为上述字段，通常只需要增加 JSON、更新 `package.json` 并补测试。如果差异改变了构建流程本身，例如需要新的路径合并策略、不同的项目属性解析方式或不同的进程启动流程，则还必须修改 TypeScript 通用逻辑。

## 2. 文件和运行时关系

相关文件如下：

```text
delphi-versions/
  schema.json       JSON Schema，供编辑器校验和补全
  XE7.json          Delphi XE7 的版本配置
  <NewVersion>.json 新版本配置

src/delphi/versions.ts
                     扫描、加载和基础校验所有版本 JSON
src/compiler/dccArgumentBuilder.ts
                     根据 dcc 配置生成参数
src/environment/bdsLocator.ts
                     根据 BDS 字段查找注册表、安装目录和环境变量
src/compiler/buildPlan.ts
                     将版本配置传入 Build Plan
package.json         注册 VS Code 版本下拉和版本相关设置
test/unit/           单元测试
test/integration/    可选的真实 DCC 集成测试
```

运行时会扫描 `delphi-versions/` 下的所有 `.json` 文件，并跳过文件名为 `schema.json` 的文件。文件名不要求与 `version` 字段相同，但推荐使用与版本显示一致的文件名，例如 `XE8.json`、`10.4.json`。每个配置的 `version` 必须唯一。

打包时，`.vscodeignore` 通过 `!delphi-versions/**` 保留这些 JSON 文件；如果新增文件后没有检查 VSIX 内容，扩展可能在开发环境正常、安装后却提示找不到版本配置。

## 3. 开始前的资料收集

新增 JSON 前，先从目标 Delphi 安装和一个能被 IDE 正常编译的最小项目中收集以下资料：

1. Delphi 产品版本和 BDS 版本号，例如 XE7 对应 `15.0`。
2. BDS 注册表键下的 `RootDir`、`Environment Variables`、`Library\\Win32` 和 `Library\\Win64`。
3. 安装目录中的真实编译器文件名，例如 `DCC32.exe`、`DCC64.exe`，以及它们是否可以独立运行。
4. `bin\\rsvars.bat` 中设置的环境变量。
5. IDE 对一个 Debug、Release 和 Rebuild 项目实际调用的 DCC 参数及顺序。
6. `.dproj` 中每个参数对应的属性名和值，尤其是路径、运行时包、调试和优化相关属性。

建议使用一个最小 `.dpr` 或 `.dpk` 项目，同时在 IDE 中分别记录 Win32、Win64、Debug、Release 和 Rebuild 的命令。不要仅根据网络文章或其他 Delphi 版本的配置推断参数，因为相同属性在不同版本中可能新增、删除或改变含义。

## 4. `schema.json` 总体结构

`schema.json` 是 JSON Schema Draft 2020-12 文件。它主要用于 VS Code 等编辑器的实时校验，不是一个新的 Delphi 版本配置文件。版本配置文件的顶层结构如下：

```json
{
  "$schema": "./schema.json",
  "version": "XE7",
  "displayName": "Delphi XE7",
  "bdsRegistryVersion": "15.0",
  "studioDirectoryVersion": "15.0",
  "settingsSection": "delphiXe7",
  "compilerSettingNames": {
    "Win32": "compilerPath",
    "Win64": "compiler64Path"
  },
  "compilerFileNames": {
    "Win32": "DCC32.exe",
    "Win64": "DCC64.exe"
  },
  "dcc": {
    "baseArguments": [],
    "rebuildArguments": [],
    "specialSwitches": {
      "unitSearchPath": "-U",
      "includePath": "-I",
      "resourcePath": "-R",
      "runtimePackages": "-LU"
    },
    "valueSwitches": {},
    "pathSwitches": {},
    "argumentRules": [],
    "knownMetadata": []
  }
}
```

### 4.1 顶层字段

| 字段 | 类型 | 作用 | 示例 |
|------|------|------|------|
| `$schema` | 字符串 | 指向 Schema，供编辑器校验 | `./schema.json` |
| `version` | 字符串 | 运行时识别版本的唯一值，也是 `delphiDcc.version` 的值 | `XE7` |
| `displayName` | 字符串 | 设置下拉中显示的版本名称；需要与 `package.json.enumItemLabels` 对应 | `Delphi XE7` |
| `bdsRegistryVersion` | 字符串 | 拼接 `Software\\Embarcadero\\BDS\\<值>` | `15.0` |
| `studioDirectoryVersion` | 字符串 | 推导默认安装目录和 BDS 用户目录 | `15.0` |
| `settingsSection` | 字符串 | VS Code 设置区段前缀 | `delphiXe7` |
| `compilerSettingNames` | 对象 | 每个平台对应的编译器路径设置后缀 | `compilerPath`、`compiler64Path` |
| `compilerFileNames` | 对象 | 未指定覆盖路径时，用于注册表/默认目录推导的文件名 | `DCC32.exe`、`DCC64.exe` |
| `dcc` | 对象 | 该版本的 DCC 参数描述 | 见下文 |

`compilerSettingNames` 和 `compilerFileNames` 必须同时包含 `Win32`、`Win64` 两个键。即使某版本实际上没有 Win64 编译器，也应保留键并使用合理的文件名；是否显示 Win64 入口由对应设置是否为空决定。

`settingsSection` 应在所有版本间唯一。它不是显示名称，也不是版本值，推荐使用 `delphi<版本标识>`，例如 `delphiXe8`。

### 4.2 `dcc.baseArguments` 和 `dcc.rebuildArguments`

这两个字段都是字符串数组。参数会按数组顺序原样加入命令行：

```json
"baseArguments": ["--no-config"],
"rebuildArguments": ["-B"]
```

实际参数顺序是：

1. `baseArguments`；
2. `valueSwitches`；
3. 运行时包参数；
4. Unit、Include、Resource 搜索路径；
5. `pathSwitches`；
6. `argumentRules`；
7. Rebuild 时的 `rebuildArguments`；
8. 设置中的 `additionalArguments`；
9. 主源码相对路径或绝对路径。

不要在数组元素中拼接完整命令，也不要把多个需要独立处理的参数写成一个字符串。`additionalArguments` 同样会以数组元素为单位追加。

`--no-config` 是否存在必须以目标编译器实际行为为准。它用于防止编译器从目录或项目中隐式读取 `.cfg`，但如果目标版本不支持该选项，就不应照抄 XE7 配置。

### 4.3 `dcc.specialSwitches`

该对象要求包含四个字段：

| 字段 | 含义 | XE7 |
|------|------|-----|
| `unitSearchPath` | Unit 搜索路径 | `-U` |
| `includePath` | Include 搜索路径 | `-I` |
| `resourcePath` | `.res`、`.dfm` 等资源搜索路径 | `-R` |
| `runtimePackages` | 运行时包列表 | `-LU` |

这些开关由通用代码使用。路径值会直接与展开后的路径列表拼接，因此必须填写编译器真实接受的开关形式。

当前代码对路径的来源和合并方式是固定的：

- Unit 路径：Debug DCU Path（启用时）、翻译后的 Debug Library Path、翻译后的 Library Path、项目 `DCC_UnitSearchPath`、BDS Library Path；
- Include 路径：项目 `DCC_IncludePath`，然后追加 Unit 路径；
- Resource 路径：翻译后的 Resource Path、`BRCC_OutputDir`、项目 Unit Search Path、项目 Resource Path、BDS Library Path。

如果新版本需要不同的合并顺序或不同的项目属性，不能只修改 `specialSwitches`，必须修改 `dccArgumentBuilder.ts`，并为该行为增加测试。

### 4.4 `dcc.valueSwitches`

用于“属性值直接接在开关后”的映射，例如：

```json
"valueSwitches": {
  "DCC_Define": "-D",
  "DCC_UnitAlias": "-A",
  "DCC_Namespace": "-NS"
}
```

如果 `.dproj` 中 `DCC_Define` 的值是 `DEBUG;TRACE`，生成结果会是一个参数 `-DDEBUG;TRACE`。值为空时不会生成参数，但该属性会被标记为已处理，不会产生“未映射 DCC 属性”警告。

不要把路径属性放入这里，应使用 `pathSwitches`，以便通用代码正确解析相对路径和分号分隔列表。

### 4.5 `dcc.pathSwitches`

每个键是 `.dproj` 属性名，每个值必须包含 `switch` 和 `kind`：

```json
"pathSwitches": {
  "DCC_ObjPath": { "switch": "-O", "kind": "list" },
  "DCC_ExeOutput": { "switch": "-E", "kind": "single" }
}
```

`kind` 有两种：

- `single`：整个值按一个路径解析；适用于输出目录等单路径属性；
- `list`：按分号拆分，每一项分别解析后再用分号连接；适用于对象文件目录或其他搜索路径。

相对路径以 `.dproj` 所在目录为基准，绝对路径会被规范化。引号会被去除。路径开关的输出顺序按照 JSON 对象的插入顺序处理；为了让顺序稳定，建议按目标 IDE 命令的顺序书写。

### 4.6 `dcc.argumentRules`

用于布尔和枚举属性。每条规则包含 `property`、`kind` 和 `values`：

```json
{
  "property": "DCC_Optimize",
  "kind": "boolean",
  "values": {
    "true": ["-$O+"],
    "false": ["-$O-"]
  }
}
```

布尔值解析接受 `true`/`false`、`1`/`0`、`yes`/`no`（不区分大小写）。无法解析的值会产生 Build Plan 警告，不会猜测编译器参数。

枚举值按 `.dproj` 展开后的字符串精确查找：

```json
{
  "property": "DCC_MapFile",
  "kind": "enum",
  "values": {
    "0": [],
    "1": ["-GS"],
    "2": ["-GP"],
    "3": ["-GD"]
  }
}
```

空数组是有意义的，表示该值已知且有意不生成任何参数。数组顺序就是最终 DCC 参数顺序；如果两个规则都会影响参数顺序，应按目标 Delphi IDE 的实际命令排列。

每条规则都会把属性标记为已处理，即使属性缺失或值不支持。不要为同一个属性重复添加规则，否则会生成重复参数。

### 4.7 `dcc.knownMetadata`

这里列出已识别、但不应该转换为 DCC 参数的 `DCC_*` 属性，例如项目描述或平台元数据：

```json
"knownMetadata": [
  "DCC_Description",
  "DCC_Platform"
]
```

如果一个 `DCC_*` 属性既没有出现在 `valueSwitches`、`pathSwitches`、`argumentRules` 中，也没有出现在 `knownMetadata`，Build Plan 会报告：

```text
DCC property is not mapped to a compiler argument: <PropertyName>
```

只有确认该属性不需要命令行参数时，才将其放入 `knownMetadata`。如果它确实影响编译，应添加正确映射，而不是压制警告。

## 5. 新增版本的完整步骤

下面以新增 `XE8` 为例。名称只是示例，实际值必须以目标 Delphi 安装为准。

### 步骤 1：复制基准配置

```powershell
Copy-Item delphi-versions/XE7.json delphi-versions/XE8.json
```

保留 `$schema` 为 `./schema.json`。先修改以下字段：

```json
{
  "version": "XE8",
  "displayName": "Delphi XE8",
  "bdsRegistryVersion": "16.0",
  "studioDirectoryVersion": "16.0",
  "settingsSection": "delphiXe8"
}
```

不要只修改 `displayName`。`version`、注册表版本、Studio 目录版本和设置区段都必须与目标版本一致。

### 步骤 2：确认编译器路径字段

根据实际安装修改：

```json
"compilerSettingNames": {
  "Win32": "compilerPath",
  "Win64": "compiler64Path"
},
"compilerFileNames": {
  "Win32": "DCC32.exe",
  "Win64": "DCC64.exe"
}
```

`compilerSettingNames` 是 `settingsSection` 下的后缀，最终设置名会是：

```text
delphiXe8.compilerPath
delphiXe8.compiler64Path
```

`compilerFileNames` 只用于没有显式路径覆盖时从 BDS RootDir 推导 `bin` 目录。某些安装使用不同文件名时，应填写真实文件名。

### 步骤 3：逐项校准 DCC 基础参数

比较 IDE 的 Build 和 Rebuild 命令：

- 是否支持 `--no-config`；
- Rebuild 是否仍使用 `-B`，是否需要其他参数；
- `-U`、`-I`、`-R`、`-LU` 是否改变；
- `-D`、`-A`、`-NS` 是否改变；
- 输出目录、DCU、BPL、DCP 和 OBJ 的开关是否改变。

只将已经在真实编译器中验证过的差异写入 JSON。不要为了“看起来完整”添加未验证的开关。

### 步骤 4：校准属性规则

将最小项目的 `.dproj` 属性和值与 IDE 命令逐项对照：

1. 直接拼接值的属性放入 `valueSwitches`；
2. 单一路径或路径列表放入 `pathSwitches`；
3. `true`/`false` 属性放入 `argumentRules` 的 `boolean`；
4. 数字或字符串枚举放入 `argumentRules` 的 `enum`；
5. 已知但无需传参的 `DCC_*` 属性放入 `knownMetadata`。

特别检查 `DCC_DebugInformation`、`DCC_DebugInfoInExe`、`DCC_SymbolReferenceInfo`、`DCC_MapFile`、`DCC_Optimize`、`DCC_DebugDCUs` 和运行时包。前六项使用规则或固定流程共同处理，不能只凭名称猜测映射。

### 步骤 5：在 `package.json` 注册版本下拉

VS Code 的设置下拉来自静态扩展清单，不能由运行时扫描 JSON 自动增加。修改 `delphiDcc.version`：

```json
"enum": [
  "XE7",
  "XE8"
],
"enumItemLabels": [
  "Delphi XE7",
  "Delphi XE8"
]
```

两个数组必须一一对应、顺序一致。`enumItemLabels` 应与各配置文件的 `displayName` 保持一致。

### 步骤 6：增加该版本的 VS Code 设置

至少增加编译器路径设置：

```json
"delphiXe8.compilerPath": {
  "type": "string",
  "default": "",
  "scope": "resource",
  "description": "Required absolute path to the Delphi XE8 DCC32.exe."
},
"delphiXe8.compiler64Path": {
  "type": "string",
  "default": "",
  "scope": "resource",
  "description": "Optional absolute path to the Delphi XE8 DCC64.exe."
}
```

当前 `BuildCommands` 还会从版本的 `settingsSection` 读取以下通用后缀，因此新版本应同时注册对应设置，否则用户无法配置这些功能：

```text
showBuildPlanMenu
outputPathHistoryLimit
outputEncoding
additionalArguments
environment
```

每个版本可以使用相同的后缀，但必须放在自己的 `settingsSection` 下，例如 `delphiXe8.outputEncoding`。复制 XE7 的设置定义后修改说明文字中的版本名即可。

建议保持以下类型和默认值：

| 完整设置名（以 `delphiXe8` 为例） | 类型 | 默认值 | 用途 |
|------|------|------|------|
| `delphiXe8.compilerPath` | 字符串 | `""` | Win32 `DCC32.exe` 绝对路径，构建必填 |
| `delphiXe8.compiler64Path` | 字符串 | `""` | Win64 `DCC64.exe` 绝对路径，非空时启用 Win64 入口 |
| `delphiXe8.showBuildPlanMenu` | 枚举字符串 | `"hide"` | `.dproj` 右键菜单是否显示 Build Plan |
| `delphiXe8.outputPathHistoryLimit` | 整数 | `5` | 每个项目保留的输出路径历史数，范围 `1`-`15` |
| `delphiXe8.outputEncoding` | 枚举字符串 | `"system"` | DCC 输出编码：`system`、`cp936` 或 `utf8` |
| `delphiXe8.additionalArguments` | 字符串数组 | `[]` | 在主源码参数前追加的 DCC 参数 |
| `delphiXe8.environment` | 字符串对象 | `{}` | 覆盖选定版本 BDS 环境的变量 |

其中 `showBuildPlanMenu` 的枚举值为 `hide`、`show`，`environment` 的每个值必须是字符串。设置作用域应为 `resource`，因为扩展会针对当前 `.dproj` 资源读取配置。

### 步骤 7：检查静态命令和菜单引用

现有命令 ID 为 `delphiXe7.*`，这是为了保持已有用户配置和其他扩展调用的兼容性。版本选择发生在命令执行时，因此命令 API 不需要为每个 Delphi 版本复制一套。

但是，VS Code 的菜单 `when` 条件是静态字符串。当前 Win64 菜单条件使用 `config.delphiXe7.compiler64Path`，Show Build Plan 菜单条件使用 `config.delphiXe7.showBuildPlanMenu`。增加新版本后，如果希望这些菜单根据新版本设置显示，需要同步修改 `package.json` 的 `when` 条件，或将菜单条件设计为能覆盖所有版本。

如果贡献者希望把命令 ID 也改成版本无关的名称，必须同时保留旧 ID 的兼容别名，并更新激活事件、扩展 API 文档和测试；这不属于仅新增配置文件的范围。

### 步骤 8：校验 JSON 和运行时发现

在支持 JSON Schema 的编辑器中打开新文件，确认没有 Schema 错误。然后运行：

```powershell
npm run check
npm test
npm run compile
```

`src/delphi/versions.ts` 会在模块加载时扫描配置。如果出现以下错误，应先修复配置，而不是绕过加载器：

- `Duplicate Delphi version configuration`：`version` 重复；
- `No Delphi version configurations were found`：目录为空或打包路径错误；
- `Invalid Delphi version configuration`：顶层必填字段或基础对象缺失。

### 步骤 9：增加单元测试

至少应更新或增加以下测试：

- `test/unit/delphiVersions.test.ts`：版本可发现、大小写解析、字段内容和重复值行为；
- `test/unit/extensionManifest.test.ts`：`delphiDcc.version.enum` 与 `enumItemLabels` 包含新版本，以及新版本设置存在；
- `test/unit/dccArgumentBuilder.test.ts`：每个新增或改变的开关、布尔值、枚举值、路径和参数顺序；
- `test/unit/bdsLocator.test.ts`：注册表版本、默认 Studio 目录和编译器文件名；
- `test/unit/buildPlan.test.ts`（如有相关场景）：版本被传递到 BDS 定位器和参数生成器。

不要只测试“配置文件能被 JSON.parse”。应断言最终生成的 `arguments` 数组，因为参数顺序和空数组行为都会影响编译结果。

### 步骤 10：使用真实编译器验证

在安装了目标 Delphi 版本的 Windows 机器上，至少验证：

| 场景 | 需要确认的内容 |
|------|----------------|
| Win32 Debug Build | DCC32 路径、环境变量、Unit/Include/Resource 路径和产物 |
| Win32 Release Build | 优化、调试信息、Map File 等规则 |
| Win32 Rebuild | Rebuild 参数确实出现且能重新编译依赖单元 |
| Win64 Build | DCC64 路径和 Win64 BDS Library/Debug DCU Path |
| `.dpk` 项目 | BPL/DCP 产物目录和运行时包参数 |
| 中文或空格路径 | 路径解析和编译器输出 |
| 错误项目 | DCC 错误能进入 Output/Problems，不会静默成功 |

建议将 IDE 的实际命令、扩展 Build Plan 的 `arguments` 和最终进程参数保存下来逐项比较。特别检查参数顺序、重复路径、相对路径基准和是否意外读取 `.cfg`。

### 步骤 11：验证 VSIX 内容

```powershell
npm run package
npx vsce ls
```

输出中必须包含：

```text
extension/delphi-versions/XE7.json
extension/delphi-versions/<NewVersion>.json
extension/delphi-versions/schema.json
```

安装生成的 VSIX 后，再从设置界面确认版本下拉和新版本编译器路径设置存在。开发目录中的 JSON 能被读取，不代表 VSIX 中一定包含它。

## 6. 什么时候需要修改 `schema.json`

如果新版本只使用现有字段，不要为了新版本单独复制 Schema。所有版本配置共用同一个 `schema.json`。

只有在配置模型需要新字段时才修改 Schema。新增 Schema 字段的完整顺序是：

1. 在 `schema.json` 的 `required`、`properties` 或 `$defs` 中定义类型、必填项和是否允许额外字段；
2. 在 `src/delphi/versions.ts` 增加 TypeScript 接口字段；
3. 在加载器的基础校验中检查该字段（如果缺失会导致运行时错误）；
4. 在实际消费者中读取该字段，例如 `dccArgumentBuilder.ts`；
5. 增加至少一个使用该字段的 JSON 配置和单元测试；
6. 更新本手册和 README 的配置字段说明；
7. 用 `npm run check`、`npm test` 和 `npm run package` 验证。

当前加载器的运行时校验比 `schema.json` 简略，主要检查顶层字符串和基础对象。因此不能把“编辑器没有红线”当成运行时已完整验证。新字段如果是必需的，应在 `versions.ts` 中加入明确错误信息。

## 7. 常见错误和排查方法

### 7.1 版本下拉没有新版本

原因通常是只添加了 JSON，没有更新 `package.json` 的 `enum` 和 `enumItemLabels`。设置清单是静态的，重新加载窗口后仍不会动态读取目录。

### 7.2 提示找不到配置文件

确认文件扩展名为 `.json`、文件已加入 VSIX、没有被 `.vscodeignore` 排除，并确认文件名不是 `schema.json`。同时检查 `npm run compile` 后的目录结构。

### 7.3 设置可以看到但编译器路径不生效

检查 `settingsSection`、`compilerSettingNames` 和 `package.json` 的完整设置名是否一致。例如配置写的是 `delphiXe8.compilerPath`，清单却注册成 `delphiXE8.compilerPath`，就可能导致用户配置读不到。还要确认 `scope` 为 `resource`，因为命令按项目资源读取设置。

### 7.4 Win64 右键菜单不显示

菜单条件由 `package.json` 的静态 `when` 表达式控制。即使 TypeScript 能读取 `delphiXe8.compiler64Path`，如果条件仍只检查 `config.delphiXe7.compiler64Path`，新版本菜单也不会显示。请按本手册第 5.7 节处理。

### 7.5 参数顺序或路径不正确

先显示 Build Plan，比较 `arguments` 数组，而不是只比较拼接后的命令行文本。检查 `argumentRules` 顺序、`pathSwitches.kind`、相对路径基准和 Unit/Include/Resource 的固定合并逻辑。

### 7.6 未映射属性警告

确认属性是否应该出现在 `valueSwitches`、`pathSwitches` 或 `argumentRules`。只有完全不需要传给 DCC 的元数据才能放入 `knownMetadata`。

### 7.7 编译器启动器无法独立运行

某些 Delphi 安装的 `DCC32.exe` 是依赖其他内部文件的启动器。验证 `compilerPath` 指向的文件能否直接运行，并检查同一版本 `bin` 目录和 `rsvars.bat` 是否完整。配置文件不能修复损坏的 Delphi 安装。

## 8. 提交前检查清单

- [ ] 新 JSON 顶层字段全部存在，且 `$schema` 指向 `./schema.json`。
- [ ] `version` 唯一，并与 `package.json` 的 `enum` 完全一致。
- [ ] `displayName` 与 `enumItemLabels` 对应。
- [ ] BDS 注册表版本、Studio 目录版本和编译器文件名已在目标机器确认。
- [ ] `settingsSection` 唯一，所有后缀设置均已在 `package.json` 注册。
- [ ] `baseArguments`、`rebuildArguments` 和 DCC 开关来自真实 IDE 命令验证。
- [ ] 路径属性使用正确的 `single` 或 `list`。
- [ ] 布尔/枚举规则覆盖了实际 `.dproj` 值，且顺序正确。
- [ ] `knownMetadata` 没有被用来掩盖真正未映射的编译属性。
- [ ] Win32、Win64、Debug、Release、Rebuild 和 `.dpk` 场景已验证。
- [ ] `npm run check`、`npm test`、`npm run compile`、`npm run package` 全部通过。
- [ ] `npx vsce ls` 确认所有版本 JSON 和 `schema.json` 在 VSIX 中。
- [ ] README 和本手册已记录新版本及其已知限制。

## 9. 参考实现

最可靠的起点是 `delphi-versions/XE7.json`。复制后只修改已确认不同的字段，保留通用逻辑能够处理的部分。若必须修改 TypeScript，请在提交说明中明确：

- 哪个编译器行为无法由现有 Schema 表示；
- 为什么不能通过已有 `valueSwitches`、`pathSwitches` 或 `argumentRules` 表达；
- 新逻辑如何保持已有Delphi版本行为不变；
- 哪些单元测试和真实编译测试证明了兼容性。
