import { describe, expect, it } from "vitest";
import { executor, MemorySubmissionRepository, problems } from "../testing/fakes.js";
import { processSubmission } from "./process.js";
import type { SubmissionStatus } from "./repository.js";
import { LocalSubmissionUpdates } from "./updates.js";

async function setup(source: string, mode: "run" | "submit" = "submit") {
  const submissions = new MemorySubmissionRepository();
  const updates = new LocalSubmissionUpdates();
  const { id } = await submissions.create({ problemId: 1, language: "python", source, mode });
  // Status the row had each time an update was published
  const published: SubmissionStatus[] = [];
  updates.subscribe((updated) => published.push(submissions.rows.get(updated)!.status));
  return { id, submissions, published, deps: { problems, submissions, executor, updates } };
}

describe("processSubmission", () => {
  it("moves a submission queued → running → done and publishes each step", async () => {
    const { id, submissions, published, deps } = await setup("ok");
    await processSubmission(deps, id, { finalAttempt: false });

    expect(published).toEqual(["running", "done"]);
    const row = await submissions.get(id);
    expect(row?.result).toMatchObject({ verdict: "accepted", passed: 2, total: 2 });
  });

  it("judges only samples in run mode", async () => {
    const { id, submissions, deps } = await setup("ok", "run");
    await processSubmission(deps, id, { finalAttempt: false });
    expect((await submissions.get(id))?.result).toMatchObject({ passed: 1, total: 1 });
  });

  it("stores a wrong answer as a normal result", async () => {
    const { id, submissions, deps } = await setup("wrong");
    await processSubmission(deps, id, { finalAttempt: true });
    const row = await submissions.get(id);
    expect(row).toMatchObject({ status: "done", result: { verdict: "wrong_answer" } });
  });

  it("skips submissions that are already finished", async () => {
    const { id, submissions, published, deps } = await setup("ok");
    await submissions.fail(id, "earlier failure");
    await processSubmission(deps, id, { finalAttempt: false });
    expect(published).toEqual([]);
    expect((await submissions.get(id))?.status).toBe("failed");
  });

  it("rethrows judge errors without failing the submission while retries remain", async () => {
    const { id, submissions, deps } = await setup("crash");
    await expect(processSubmission(deps, id, { finalAttempt: false })).rejects.toThrow("sandbox unreachable");
    expect((await submissions.get(id))?.status).toBe("running");
  });

  it("marks the submission failed on the final attempt", async () => {
    const { id, submissions, published, deps } = await setup("crash");
    await expect(processSubmission(deps, id, { finalAttempt: true })).rejects.toThrow();
    expect(await submissions.get(id)).toMatchObject({ status: "failed", error: "sandbox unreachable" });
    expect(published).toEqual(["running", "failed"]);
  });
});
