import { describe, expect, it } from "vitest";
import { normalizeOutput, outputsMatch } from "./compare.js";

describe("outputsMatch", () => {
  it("ignores trailing whitespace and trailing newlines", () => {
    expect(outputsMatch("42  \n\n\n", "42\n")).toBe(true);
    expect(outputsMatch("a \nb\t\n", "a\nb")).toBe(true);
  });

  it("ignores Windows line endings", () => {
    expect(outputsMatch("1\r\n2\r\n", "1\n2\n")).toBe(true);
  });

  it("does not ignore leading whitespace or inner differences", () => {
    expect(outputsMatch(" 42", "42")).toBe(false);
    expect(outputsMatch("1 2", "1  2")).toBe(false);
    expect(outputsMatch("1\n\n2", "1\n2")).toBe(false);
  });

  it("treats empty output as empty", () => {
    expect(normalizeOutput("\n\n")).toBe("");
  });
});
