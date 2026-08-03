export type DelphiPlatform = "Win32" | "Win64";

export interface ProjectConfiguration {
  name: string;
  key: string;
  parentKey?: string;
}

export interface DprojEvaluation {
  projectFile: string;
  mainSource: string;
  configuration: string;
  platform: DelphiPlatform;
  configurations: ProjectConfiguration[];
  properties: Record<string, string>;
  warnings: string[];
}

export interface BuildPlan {
  projectFile: string;
  mainSource: string;
  compilerPath: string;
  workingDirectory: string;
  configuration: string;
  platform: DelphiPlatform;
  environment: Record<string, string>;
  arguments: string[];
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
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  durationMs: number;
  cancelled: boolean;
}
