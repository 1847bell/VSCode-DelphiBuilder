import path from "node:path";

export const PROJECT_GROUPS_STATE_KEY = "delphiDcc.projectGroups";

export interface GroupedProject {
  filePath: string;
  activeConfiguration?: string;
}

export interface ProjectGroup {
  id: string;
  name: string;
  projects: GroupedProject[];
}

export type GroupMoveDirection = "up" | "down";

export function normalizeProjectGroups(value: unknown): ProjectGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const groups: ProjectGroup[] = [];
  const groupIds = new Set<string>();
  const projectPaths = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const id = readNonEmptyString(item.id);
    const name = readNonEmptyString(item.name);
    if (!id || !name || groupIds.has(id)) {
      continue;
    }

    const projects: GroupedProject[] = [];
    if (Array.isArray(item.projects)) {
      for (const candidate of item.projects) {
        if (!isRecord(candidate)) {
          continue;
        }
        const filePath = readProjectPath(candidate.filePath);
        const key = filePath ? projectKey(filePath) : undefined;
        if (!filePath || !key || projectPaths.has(key)) {
          continue;
        }
        projectPaths.add(key);
        const activeConfiguration = readNonEmptyString(candidate.activeConfiguration);
        projects.push({ filePath, ...(activeConfiguration ? { activeConfiguration } : {}) });
      }
    }

    groupIds.add(id);
    groups.push({ id, name, projects });
  }
  return groups;
}

export function addProjectGroup(
  groups: readonly ProjectGroup[],
  id: string,
  name: string
): ProjectGroup[] {
  const normalizedName = requireUniqueGroupName(groups, name);
  if (!id.trim() || groups.some((group) => group.id === id)) {
    throw new Error("The group id must be non-empty and unique.");
  }
  return [...groups, { id, name: normalizedName, projects: [] }];
}

export function renameProjectGroup(
  groups: readonly ProjectGroup[],
  groupId: string,
  name: string
): ProjectGroup[] {
  const group = requireGroup(groups, groupId);
  const normalizedName = requireUniqueGroupName(groups, name, groupId);
  return groups.map((item) => item === group ? { ...item, name: normalizedName } : item);
}

export function moveProjectGroup(
  groups: readonly ProjectGroup[],
  groupId: string,
  direction: GroupMoveDirection
): ProjectGroup[] {
  const index = groups.findIndex((group) => group.id === groupId);
  if (index < 0) {
    throw new Error("The project group no longer exists.");
  }
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= groups.length) {
    return [...groups];
  }
  const result = [...groups];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export function sortProjectGroups(groups: readonly ProjectGroup[]): ProjectGroup[] {
  return [...groups].sort((left, right) => left.name.localeCompare(
    right.name,
    undefined,
    { numeric: true, sensitivity: "base" }
  ));
}

export function addProjectToGroup(
  groups: readonly ProjectGroup[],
  groupId: string,
  filePath: string
): ProjectGroup[] {
  const group = requireGroup(groups, groupId);
  const normalizedPath = readProjectPath(filePath);
  if (!normalizedPath) {
    throw new Error("Only .dproj project files can be added.");
  }
  const key = projectKey(normalizedPath);
  if (groups.some((item) => item.projects.some((project) => projectKey(project.filePath) === key))) {
    throw new Error(`${path.basename(normalizedPath)} is already in a project group.`);
  }
  return groups.map((item) => (
    item === group
      ? { ...item, projects: [...item.projects, { filePath: normalizedPath }] }
      : item
  ));
}

export function setActiveProjectConfiguration(
  groups: readonly ProjectGroup[],
  groupId: string,
  filePath: string,
  configuration: string
): ProjectGroup[] {
  const group = requireGroup(groups, groupId);
  const key = projectKey(filePath);
  const activeConfiguration = configuration.trim();
  if (!activeConfiguration) {
    throw new Error("The active configuration cannot be empty.");
  }
  if (!group.projects.some((project) => projectKey(project.filePath) === key)) {
    throw new Error("The project no longer exists in this group.");
  }
  return groups.map((item) => (
    item === group
      ? {
        ...item,
        projects: item.projects.map((project) => (
          projectKey(project.filePath) === key
            ? { ...project, activeConfiguration }
            : project
        ))
      }
      : item
  ));
}

function requireGroup(groups: readonly ProjectGroup[], groupId: string): ProjectGroup {
  const group = groups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("The project group no longer exists.");
  }
  return group;
}

function requireUniqueGroupName(
  groups: readonly ProjectGroup[],
  name: string,
  excludedGroupId?: string
): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("The group name cannot be empty.");
  }
  const key = normalized.toLocaleLowerCase();
  if (groups.some((group) => group.id !== excludedGroupId && group.name.toLocaleLowerCase() === key)) {
    throw new Error(`A group named '${normalized}' already exists.`);
  }
  return normalized;
}

function readProjectPath(value: unknown): string | undefined {
  const filePath = readNonEmptyString(value);
  if (!filePath || path.extname(filePath).toLocaleLowerCase() !== ".dproj") {
    return undefined;
  }
  return path.normalize(path.resolve(filePath));
}

function projectKey(filePath: string): string {
  return path.normalize(path.resolve(filePath)).toLocaleLowerCase();
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
