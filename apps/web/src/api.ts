import type { Language, Problem, ProblemSummary, SubmissionResult } from "./types";

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
  submit: (body: { problemSlug: string; language: string; source: string; mode: "run" | "submit" }) =>
    request<SubmissionResult>("/api/submissions", { method: "POST", body: JSON.stringify(body) }),
};
