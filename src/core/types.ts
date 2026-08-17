export type DelphiPlatform = "Win32" | "Win64";
export type DelphiVersion = string;

export interface ProjectConfiguration {
  name: string;
  key: string;
  parentKey?: string;
}

export interface ProjectResourceItem {
  kind: "RcCompile" | "RcItem";
  include: string;
  suffix?: string;
}

export interface DprojEvaluation {
  projectFile: string;
  mainSource: string;
  configuration: string;
  platform: DelphiPlatform;
  configurations: ProjectConfiguration[];
  resourceItems: ProjectResourceItem[];
  properties: Record<string, string>;
  warnings: string[];
}

export interface ResourceBuildStep {
  executable: string;
  arguments: string[];
  input: string;
  output: string;
}

export interface ProjectResourceBuildStep {
  output: string;
  createIfMissing: true;
}

export interface BuildPlan {
  version: DelphiVersion;
  projectFile: string;
  mainSource: string;
  compilerPath: string;
  workingDirectory: string;
  configuration: string;
  platform: DelphiPlatform;
  environment: Record<string, string>;
  arguments: string[];
  projectResource?: ProjectResourceBuildStep;
  resourceBuild?: ResourceBuildStep[];
  expectedArtifacts: string[];
  warnings: string[];
}

export type DiagnosticLevel = "error" | "warning" | "hint";

export interface CompilerDiagnostic {
  file: string;
  line: number;
  column?: number;
  level: DiagnosticLevel;
  code?: string;
  message: string;
  raw: string;
}

export interface BuildResult {
  stage: "resource" | "compiler";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  durationMs: number;
  cancelled: boolean;
}
