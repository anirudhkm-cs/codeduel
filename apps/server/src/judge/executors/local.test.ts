import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { LanguageId } from "../types.js";
import { LocalExecutor } from "./local.js";

const has = (cmd: string) => {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const limits = { timeLimitMs: 2000, memoryLimitKb: 256000 };
const exec = new LocalExecutor();

const SUM: Record<LanguageId, { tool: string; source: string }> = {
  python: { tool: "python3", source: "a, b = map(int, input().split())\nprint(a + b)\n" },
  javascript: {
    tool: "node",
    source: 'const [a,b]=require("fs").readFileSync(0,"utf8").trim().split(" ").map(Number);console.log(a+b);',
  },
  cpp: {
    tool: "g++",
    source: "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<std::endl;}",
  },
  java: {
    tool: "javac",
    source:
      "import java.util.*;public class Main{public static void main(String[] x){Scanner s=new Scanner(System.in);System.out.println(s.nextLong()+s.nextLong());}}",
  },
};

describe("LocalExecutor", () => {
  for (const [lang, { tool, source }] of Object.entries(SUM) as [LanguageId, (typeof SUM)[LanguageId]][]) {
    it.skipIf(!has(tool))(`runs ${lang}`, async () => {
      const results = await exec.runBatch(lang, source, ["1 2\n", "-5 5\n"], limits);
      expect(results.map((r) => [r.status, r.stdout.trim()])).toEqual([
        ["ok", "3"],
        ["ok", "0"],
      ]);
    }, 30_000);
  }

  it.skipIf(!has("python3"))("detects runtime errors", async () => {
    const [r] = await exec.runBatch("python", "raise ValueError('boom')", [""], limits);
    expect(r!.status).toBe("runtime_error");
    expect(r!.stderr).toContain("boom");
  });

  it.skipIf(!has("python3"))("kills programs that exceed the time limit", async () => {
    const [r] = await exec.runBatch("python", "while True: pass", [""], { ...limits, timeLimitMs: 300 });
    expect(r!.status).toBe("time_limit");
  });

  it.skipIf(!has("g++"))("reports compile errors", async () => {
    const results = await exec.runBatch("cpp", "int main( { }", ["", ""], limits);
    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("compile_error");
    expect(results[0]!.compileOutput).toMatch(/error/);
  }, 30_000);
});
