import { describe, expect, it } from "vitest";
import { Judge0Executor, mapJudge0Status, type Judge0Submission } from "./judge0.js";

const b64 = (s: string) => Buffer.from(s).toString("base64");

function sub(token: string, statusId: number, extra: Partial<Judge0Submission> = {}): Judge0Submission {
  return {
    token,
    status: { id: statusId, description: "" },
    stdout: null,
    stderr: null,
    compile_output: null,
    message: null,
    time: null,
    memory: null,
    ...extra,
  };
}

describe("mapJudge0Status", () => {
  it("maps Judge0 status ids", () => {
    expect(mapJudge0Status(1)).toBe("pending");
    expect(mapJudge0Status(2)).toBe("pending");
    expect(mapJudge0Status(3)).toBe("ok");
    expect(mapJudge0Status(5)).toBe("time_limit");
    expect(mapJudge0Status(6)).toBe("compile_error");
    expect(mapJudge0Status(11)).toBe("runtime_error");
    expect(mapJudge0Status(13)).toBe("internal_error");
  });
});

describe("Judge0Executor", () => {
  it("creates a batch, polls until done, and decodes results", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    let polls = 0;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") {
        return new Response(JSON.stringify([{ token: "t1" }, { token: "t2" }]));
      }
      polls++;
      const submissions =
        polls === 1
          ? [sub("t1", 2), sub("t2", 1)]
          : [
              sub("t1", 3, { stdout: b64("3\n"), time: "0.012", memory: 3000 }),
              sub("t2", 5, { time: "2.001" }),
            ];
      return new Response(JSON.stringify({ submissions }));
    }) as typeof fetch;

    const exec = new Judge0Executor({
      baseUrl: "http://judge0:2358/",
      authToken: "secret",
      pollIntervalMs: 1,
      fetchImpl,
    });
    const results = await exec.runBatch("python", "print(3)", ["1 2", "x"], {
      timeLimitMs: 2000,
      memoryLimitKb: 128000,
    });

    expect(results).toEqual([
      { status: "ok", stdout: "3\n", stderr: "", compileOutput: undefined, timeMs: 12, memoryKb: 3000 },
      { status: "time_limit", stdout: "", stderr: "", compileOutput: undefined, timeMs: 2001, memoryKb: null },
    ]);

    const post = calls[0]!;
    expect(post.url).toBe("http://judge0:2358/submissions/batch?base64_encoded=true");
    expect((post.init?.headers as Record<string, string>)["X-Auth-Token"]).toBe("secret");
    const body = JSON.parse(post.init!.body as string);
    expect(body.submissions[0]).toEqual({
      language_id: 71,
      source_code: b64("print(3)"),
      stdin: b64("1 2"),
      cpu_time_limit: 2,
      memory_limit: 128000,
    });
    expect(polls).toBe(2);
  });

  it("throws a helpful error when Judge0 rejects the request", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const exec = new Judge0Executor({ baseUrl: "http://judge0", fetchImpl });
    await expect(
      exec.runBatch("python", "", ["1"], { timeLimitMs: 1000, memoryLimitKb: 1000 }),
    ).rejects.toThrow(/503/);
  });
});
