import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { processSubmission } from "./submissions/process.js";
import { LocalSubmissionUpdates } from "./submissions/updates.js";
import { executor, ManualQueue, MemorySubmissionRepository, problems } from "./testing/fakes.js";

function setup() {
  const submissions = new MemorySubmissionRepository();
  const queue = new ManualQueue();
  const updates = new LocalSubmissionUpdates();
  const app = createApp({ problems, submissions, queue, updates, executorName: "fake" });
  /** Stand-in for the worker: judge everything queued so far. */
  const drain = async () => {
    for (const id of queue.ids.splice(0)) {
      await processSubmission({ problems, submissions, executor, updates }, id, { finalAttempt: true });
    }
  };
  return { app, submissions, queue, drain };
}

const submit = (app: ReturnType<typeof setup>["app"], source: string, mode: "run" | "submit") =>
  request(app).post("/api/submissions").send({ problemSlug: "a-plus-b", language: "python", source, mode });

describe("API", () => {
  it("lists problems", async () => {
    const res = await request(setup().app).get("/api/problems");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ slug: "a-plus-b" })]);
  });

  it("returns a problem with samples only", async () => {
    const res = await request(setup().app).get("/api/problems/a-plus-b");
    expect(res.status).toBe(200);
    expect(res.body.samples).toEqual([{ input: "1 2\n", output: "3\n" }]);
  });

  it("404s on an unknown problem", async () => {
    const res = await request(setup().app).get("/api/problems/nope");
    expect(res.status).toBe(404);
  });
});

describe("submissions", () => {
  it("queues a submission and returns 202 right away", async () => {
    const { app, queue } = setup();
    const res = await submit(app, "ok", "run");
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ id: expect.any(String), mode: "run", status: "queued" });
    expect(queue.ids).toEqual([res.body.id]);

    const status = await request(app).get(`/api/submissions/${res.body.id}`);
    expect(status.body).toEqual({ id: res.body.id, mode: "run", status: "queued" });
  });

  it("run mode judges samples only", async () => {
    const { app, drain } = setup();
    const { body } = await submit(app, "ok", "run");
    await drain();
    const res = await request(app).get(`/api/submissions/${body.id}`);
    expect(res.body).toMatchObject({ status: "done", result: { verdict: "accepted", passed: 1, total: 1 } });
  });

  it("submit mode judges all tests and hides hidden data", async () => {
    const { app, drain } = setup();
    const { body } = await submit(app, "wrong", "submit");
    await drain();
    const res = await request(app).get(`/api/submissions/${body.id}`);
    expect(res.body.result).toMatchObject({ verdict: "wrong_answer", passed: 0, total: 2 });
    expect(res.body.result.tests[1]).toEqual({ ordinal: 2, verdict: "wrong_answer", timeMs: 5, isSample: false });
    expect(JSON.stringify(res.body)).not.toContain("40 2");
  });

  it("never exposes source code or internal errors", async () => {
    const { app, drain } = setup();
    const { body } = await submit(app, "crash", "submit");
    await drain().catch(() => {});
    const res = await request(app).get(`/api/submissions/${body.id}`);
    expect(res.body).toMatchObject({ status: "failed", error: expect.stringContaining("try again") });
    expect(JSON.stringify(res.body)).not.toMatch(/crash|sandbox unreachable/);
  });

  it("returns 503 and marks the submission failed when the queue is down", async () => {
    const { app, queue, submissions } = setup();
    queue.failWith = new Error("redis down");
    const res = await submit(app, "ok", "submit");
    expect(res.status).toBe(503);
    expect([...submissions.rows.values()][0]).toMatchObject({ status: "failed" });
  });

  it("validates the request body", async () => {
    const res = await request(setup().app)
      .post("/api/submissions")
      .send({ problemSlug: "a-plus-b", language: "cobol", source: "x", mode: "submit" });
    expect(res.status).toBe(400);
  });

  it("404s on unknown submissions", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/submissions/nope")).status).toBe(404);
    expect((await request(app).get("/api/submissions/nope/events")).status).toBe(404);
  });
});

describe("submission events (SSE)", () => {
  const servers: { close(): void }[] = [];
  afterEach(() => servers.splice(0).forEach((s) => s.close()));

  /** Starts the app on a random port and opens the event stream with fetch. */
  async function openStream(app: ReturnType<typeof setup>["app"], id: string) {
    const server = app.listen(0);
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/submissions/${id}/events`);
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    /** Resolves with the next `data:` event, or null once the server closes the stream. */
    const next = async (): Promise<{ status: string; result?: { verdict: string } } | null> => {
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (frame.startsWith("data: ")) return JSON.parse(frame.slice(6));
          continue; // heartbeat comment
        }
        const { value, done } = await reader.read();
        if (done) return null;
        buffer += value;
      }
    };
    return { res, next };
  }

  it("streams queued → running → done, then closes", async () => {
    const { app, drain } = setup();
    const { body } = await submit(app, "ok", "submit");
    const { res, next } = await openStream(app, body.id);

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await next()).toMatchObject({ status: "queued" });
    await drain();
    expect(await next()).toMatchObject({ status: "running" });
    expect(await next()).toMatchObject({ status: "done", result: { verdict: "accepted" } });
    expect(await next()).toBeNull();
  });

  it("sends the final state and closes for an already finished submission", async () => {
    const { app, drain } = setup();
    const { body } = await submit(app, "wrong", "run");
    await drain();
    const { next } = await openStream(app, body.id);
    expect(await next()).toMatchObject({ status: "done", result: { verdict: "wrong_answer" } });
    expect(await next()).toBeNull();
  });
});
