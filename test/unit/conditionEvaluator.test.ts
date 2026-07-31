import { describe, expect, it } from "vitest";
import { ConditionSyntaxError, evaluateCondition } from "../../src/project/conditionEvaluator";
import { PropertyBag } from "../../src/project/propertyResolver";

describe("evaluateCondition", () => {
  const properties = new PropertyBag({ Config: "Debug", Platform: "Win32", Enabled: "true" });

  it("evaluates comparisons, boolean operators and parentheses", () => {
    expect(evaluateCondition("'$(Config)' == 'debug' and ('$(Platform)' == 'Win32' or false)", properties)).toBe(true);
    expect(evaluateCondition("'$(Config)' != 'Debug' or '$(Platform)' != 'Win32'", properties)).toBe(false);
  });

  it("evaluates a bare expanded boolean value", () => {
    expect(evaluateCondition("$(Enabled)", properties)).toBe(true);
  });

  it("rejects function calls instead of executing them", () => {
    expect(() => evaluateCondition("Exists('file')", properties)).toThrow(ConditionSyntaxError);
  });
});
