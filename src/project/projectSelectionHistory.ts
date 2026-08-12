import path from "node:path";

export const PROJECT_SELECTION_HISTORY_LIMIT = 10;

export function getProjectSelectionHistory(
  storedValue: unknown,
  availableProjects: readonly string[]
): string[] {
  if (!Array.isArray(storedValue)) {
    return [];
  }

  const availableByKey = new Map(
    availableProjects.map((projectFile) => [projectHistoryKey(projectFile), projectFile])
  );
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of storedValue) {
    if (typeof item !== "string") {
      continue;
    }
    const key = projectHistoryKey(item);
    const projectFile = availableByKey.get(key);
    if (!projectFile || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(projectFile);
    if (result.length === PROJECT_SELECTION_HISTORY_LIMIT) {
      break;
    }
  }

  return result;
}

export function updateProjectSelectionHistory(
  storedValue: unknown,
  projectFile: string
): string[] {
  const history = Array.isArray(storedValue) ? storedValue : [];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of [projectFile, ...history]) {
    if (typeof item !== "string" || !item.trim()) {
      continue;
    }
    const normalized = path.normalize(item);
    const key = projectHistoryKey(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length === PROJECT_SELECTION_HISTORY_LIMIT) {
      break;
    }
  }

  return result;
}

function projectHistoryKey(projectFile: string): string {
  return path.normalize(projectFile).toLocaleLowerCase();
}
