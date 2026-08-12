import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getProjectSelectionHistory,
  PROJECT_SELECTION_HISTORY_LIMIT,
  updateProjectSelectionHistory
} from "../../src/project/projectSelectionHistory";

describe("projectSelectionHistory", () => {
  it("is empty before the workspace has project history", () => {
    expect(getProjectSelectionHistory(undefined, [path.resolve("First.dproj")])).toEqual([]);
  });

  it("stores the 10 most recently selected unique projects", () => {
    let history: unknown;
    for (let index = 0; index < PROJECT_SELECTION_HISTORY_LIMIT + 2; index += 1) {
      history = updateProjectSelectionHistory(history, path.resolve(`Project${index}.dproj`));
    }

    expect(history).toEqual(
      Array.from({ length: PROJECT_SELECTION_HISTORY_LIMIT }, (_, index) => (
        path.resolve(`Project${PROJECT_SELECTION_HISTORY_LIMIT + 1 - index}.dproj`)
      ))
    );
    expect(updateProjectSelectionHistory(history, path.resolve("PROJECT5.dproj"))[0])
      .toBe(path.resolve("PROJECT5.dproj"));
  });

  it("only displays history entries that still belong to the open workspace", () => {
    const first = path.resolve("First.dproj");
    const second = path.resolve("Second.dproj");
    const removed = path.resolve("Removed.dproj");
    const stored = [removed, second, first];

    expect(getProjectSelectionHistory(stored, [first, second])).toEqual([second, first]);
    expect(getProjectSelectionHistory(stored, [])).toEqual([]);
  });
});
