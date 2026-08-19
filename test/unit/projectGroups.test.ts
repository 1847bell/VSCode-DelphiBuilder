import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addProjectGroup,
  addProjectToGroup,
  moveProjectGroup,
  normalizeProjectGroups,
  renameProjectGroup,
  setActiveProjectConfiguration,
  sortProjectGroups
} from "../../src/project/projectGroups";

describe("project groups", () => {
  it("normalizes persisted groups and removes duplicate projects", () => {
    const project = path.resolve("Sample.dproj");
    expect(normalizeProjectGroups([
      {
        id: "first",
        name: " Applications ",
        projects: [
          { filePath: project, activeConfiguration: " Release " },
          { filePath: path.resolve("Ignore.txt") }
        ]
      },
      {
        id: "second",
        name: "Libraries",
        projects: [{ filePath: project.toLocaleUpperCase() }]
      },
      { id: "first", name: "Duplicate id", projects: [] },
      null
    ])).toEqual([
      {
        id: "first",
        name: "Applications",
        projects: [{ filePath: project, activeConfiguration: "Release" }]
      },
      { id: "second", name: "Libraries", projects: [] }
    ]);
  });

  it("creates, renames, and reorders groups", () => {
    let groups = addProjectGroup([], "one", "Applications");
    groups = addProjectGroup(groups, "two", "Libraries");
    groups = renameProjectGroup(groups, "two", "Packages");
    groups = moveProjectGroup(groups, "two", "up");

    expect(groups.map((group) => `${group.id}:${group.name}`)).toEqual([
      "two:Packages",
      "one:Applications"
    ]);
    expect(() => renameProjectGroup(groups, "two", " applications ")).toThrow(/already exists/i);

    groups = addProjectGroup(groups, "three", "App 10");
    groups = addProjectGroup(groups, "four", "App 2");
    expect(sortProjectGroups(groups).map((group) => group.name)).toEqual([
      "App 2",
      "App 10",
      "Applications",
      "Packages"
    ]);
  });

  it("adds each dproj once and tracks its active configuration", () => {
    const project = path.resolve("Sample.dproj");
    let groups = addProjectGroup([], "one", "Applications");
    groups = addProjectGroup(groups, "two", "Libraries");
    groups = addProjectToGroup(groups, "one", project);
    groups = setActiveProjectConfiguration(groups, "one", project, "Release");

    expect(groups[0].projects).toEqual([{ filePath: project, activeConfiguration: "Release" }]);
    expect(() => addProjectToGroup(groups, "two", project.toLocaleUpperCase())).toThrow(/already/i);
    expect(() => addProjectToGroup(groups, "one", "Sample.dpr")).toThrow(/\.dproj/i);
  });
});
