import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExecutionResult, Executor, LanguageId, Limits } from "../types.js";

/**
 * ⚠️ DEVELOPMENT ONLY ⚠️
 *
 * Runs submissions directly on the host with a wall-clock timeout and an
 * output cap. There is NO isolation: no filesystem/network sandbox and no
 * memory limit. It exists so you can build the app without Judge0 running.
 * `loadConfig()` refuses to start with this executor in production.
 */

const MAX_OUTPUT_BYTES = 1_000_000;
const COMPILE_TIMEOUT_MS = 20_000;

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  outputExceeded: boolean;
  timeMs: number;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; stdin: string; timeoutMs: number },
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputExceeded = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    const collect = (which: "stdout" | "stderr") => (chunk: Buffer) => {
      if (which === "stdout") stdout += chunk.toString();
      else stderr += chunk.toString();
      if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill("SIGKILL");
      }
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(err), exitCode: -1, timedOut, outputExceeded, timeMs: 0 });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
        outputExceeded,
        timeMs: Math.round(performance.now() - started),
      });
    });

    child.stdin.on("error", () => {}); // program may exit without reading stdin
    child.stdin.end(opts.stdin);
  });
}

interface Toolchain {
  file: string;
  compile?: [string, string[]];
  run: [string, string[]];
}

const TOOLCHAINS: Record<LanguageId, Toolchain> = {
  python: { file: "main.py", run: ["python3", ["main.py"]] },
  javascript: { file: "main.js", run: ["node", ["main.js"]] },
  cpp: {
    file: "main.cpp",
    compile: ["g++", ["-O2", "-std=c++17", "-o", "main", "main.cpp"]],
    run: ["./main", []],
  },
  java: {
    file: "Main.java",
    compile: ["javac", ["Main.java"]],
    run: ["java", ["-Xmx256m", "-cp", ".", "Main"]],
  },
};

export class LocalExecutor implements Executor {
  readonly name = "local";

  async runBatch(
    language: LanguageId,
    source: string,
    inputs: string[],
    limits: Limits,
  ): Promise<ExecutionResult[]> {
    const toolchain = TOOLCHAINS[language];
    const dir = await mkdtemp(path.join(tmpdir(), "codeduel-"));
    try {
      await writeFile(path.join(dir, toolchain.file), source);

      if (toolchain.compile) {
        const [cmd, args] = toolchain.compile;
        const compiled = await runProcess(cmd, args, { cwd: dir, stdin: "", timeoutMs: COMPILE_TIMEOUT_MS });
        if (compiled.exitCode !== 0) {
          const compileOutput = compiled.timedOut ? "Compilation timed out" : compiled.stderr || compiled.stdout;
          return inputs.map(() => ({
            status: "compile_error",
            stdout: "",
            stderr: "",
            compileOutput,
            timeMs: null,
            memoryKb: null,
          }));
        }
      }

      // JVM startup is slow; give it extra wall time like most judges do.
      const timeoutMs = language === "java" ? limits.timeLimitMs * 2 : limits.timeLimitMs;
      const [cmd, args] = toolchain.run;
      const results: ExecutionResult[] = [];
      for (const input of inputs) {
        const r = await runProcess(cmd, args, { cwd: dir, stdin: input, timeoutMs });
        results.push({
          status: r.timedOut ? "time_limit" : r.outputExceeded || r.exitCode !== 0 ? "runtime_error" : "ok",
          stdout: r.stdout,
          stderr: r.outputExceeded ? r.stderr + "\nOutput limit exceeded" : r.stderr,
          timeMs: r.timeMs,
          memoryKb: null,
        });
      }
      return results;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
