import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { ProblemSummary } from "../types";

export function ProblemList() {
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.problems().then(setProblems).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="list-page">
      <section className="hero">
        <h1>
          Practice now.
          <br />
          <span className="accent">Duel soon.</span>
        </h1>
        <p>Solve problems against hidden tests. Head-to-head matches are on the way.</p>
      </section>

      {error && <p className="error-box">Couldn't load problems: {error}. Is the API running?</p>}
      {!problems && !error && <p className="muted">Loading problems…</p>}

      {problems && (
        <ol className="problem-list">
          {problems.map((p, i) => (
            <li key={p.slug}>
              <Link to={`/problems/${p.slug}`}>
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <span className="title">{p.title}</span>
                <span className={`badge ${p.difficulty}`}>{p.difficulty}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
