import { describe, expect, it } from "vitest";
import { PROBLEMS } from "./problems.js";

describe("seed problems", () => {
  it("have unique slugs", () => {
    const slugs = PROBLEMS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  for (const p of PROBLEMS) {
    it(`${p.slug} is well-formed`, () => {
      expect(p.samples).toBeGreaterThan(0);
      expect(p.inputs.length).toBeGreaterThan(p.samples); // at least one hidden test
      for (const input of p.inputs) {
        expect(input.endsWith("\n")).toBe(true);
        expect(p.solve(input).length).toBeGreaterThan(0);
      }
    });
  }
});
