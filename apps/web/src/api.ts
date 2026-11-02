import type { Language, Problem, ProblemSummary, Submission } from "./types";

// In dev, Vite proxies /api to the server. In production set VITE_API_URL.
const BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  languages: () => request<Language[]>("/api/languages"),
  problems: () => request<ProblemSummary[]>("/api/problems"),
  problem: (slug: string) => request<Problem>(`/api/problems/${slug}`),
  /** Queues a submission; the response is just its id and status "queued". */
  submit: (body: { problemSlug: string; language: string; source: string; mode: "run" | "submit" }) =>
    request<Submission>("/api/submissions", { method: "POST", body: JSON.stringify(body) }),
  submission: (id: string) => request<Submission>(`/api/submissions/${id}`),
};

const isFinished = (s: Submission) => s.status === "done" || s.status === "failed";
const POLL_MS = 1000;
const MAX_POLL_ERRORS = 5;

/**
 * Follows a submission until it is done or failed, calling onUpdate on every
 * change. Uses the server's event stream, and falls back to polling if the
 * stream can't be opened or drops.
 */
export function watchSubmission(
  id: string,
  onUpdate: (s: Submission) => void,
  signal?: AbortSignal,
): Promise<Submission> {
  return new Promise((resolve, reject) => {
    const events = new EventSource(`${BASE}/api/submissions/${id}/events`);
    let poll: ReturnType<typeof setTimeout> | undefined;
    let pollErrors = 0;
    let settled = false;

    const stop = () => {
      settled = true;
      events.close();
      clearTimeout(poll);
    };
    const handle = (s: Submission) => {
      if (settled) return;
      onUpdate(s);
      if (isFinished(s)) {
        stop();
        resolve(s);
      }
    };
    const pollOnce = () => {
      api
        .submission(id)
        .then((s) => {
          pollErrors = 0;
          handle(s);
        })
        .catch((e: Error) => {
          if (++pollErrors >= MAX_POLL_ERRORS) {
            stop();
            reject(e);
          }
        })
        .finally(() => {
          if (!settled) poll = setTimeout(pollOnce, POLL_MS);
        });
    };

    events.onmessage = (e) => handle(JSON.parse(e.data) as Submission);
    events.onerror = () => {
      // EventSource would keep reconnecting on its own; polling is simpler to reason about.
      if (settled || poll) return;
      events.close();
      pollOnce();
    };
    signal?.addEventListener("abort", () => {
      stop();
      reject(new DOMException("Stopped watching submission", "AbortError"));
    });
  });
}
