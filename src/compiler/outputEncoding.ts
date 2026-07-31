import { spawn } from "node:child_process";

export type OutputEncodingSetting = "system" | "cp936" | "utf8";

export async function resolveOutputEncoding(setting: OutputEncodingSetting): Promise<string> {
  if (setting !== "system") {
    return setting;
  }
  if (process.platform !== "win32") {
    return "utf8";
  }

  try {
    const output = await runChcp();
    const match = output.match(/(\d{3,5})/);
    return match ? `cp${match[1]}` : "cp936";
  } catch {
    return "cp936";
  }
}

function runChcp(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("chcp.com", [], { windowsHide: true, shell: false });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(Buffer.concat(chunks).toString("ascii"));
      } else {
        reject(new Error(`chcp.com exited with code ${exitCode}`));
      }
    });
  });
}
