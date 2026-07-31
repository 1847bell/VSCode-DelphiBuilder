import { spawn } from "node:child_process";
import iconv from "iconv-lite";

export type RegistryView = "32" | "64";

export async function queryRegistry(
  key: string,
  valueName?: string,
  view: RegistryView = "32",
  encoding = "cp936"
): Promise<Record<string, string>> {
  const args = ["query", key];
  if (valueName) {
    args.push("/v", valueName);
  }
  args.push(`/reg:${view}`);

  const { exitCode, output } = await runReg(args);
  if (exitCode !== 0) {
    return {};
  }
  return parseRegistryQueryOutput(iconv.decode(output, encoding));
}

export function parseRegistryQueryOutput(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(.*?)\s+REG_(?:SZ|EXPAND_SZ|MULTI_SZ|DWORD)\s+(.*)$/i);
    if (match) {
      values[match[1].trim()] = match[2].trim();
    }
  }
  return values;
}

function runReg(args: string[]): Promise<{ exitCode: number | null; output: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn("reg.exe", args, { windowsHide: true, shell: false });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        resolve({ exitCode: 1, output: Buffer.alloc(0) });
      } else {
        reject(error);
      }
    });
    child.once("close", (exitCode) => resolve({ exitCode, output: Buffer.concat(chunks) }));
  });
}
