import { useState } from "react";
import type { SubmissionResult, TestResult, Verdict } from "../types";

export const VERDICT_LABEL: Record<Verdict, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  time_limit_exceeded: "Time Limit Exceeded",
  memory_limit_exceeded: "Memory Limit Exceeded",
  runtime_error: "Runtime Error",
  compile_error: "Compilation Error",
  internal_error: "Judge Error",
};

const SHORT: Record<Verdict, string> = {
  accepted: "AC",
  wrong_answer: "WA",
  time_limit_exceeded: "TLE",
  memory_limit_exceeded: "MLE",
  runtime_error: "RE",
  compile_error: "CE",
  internal_error: "IE",
};

interface Props {
  result: SubmissionResult | null;
  error: string | null;
  pending: "run" | "submit" | null;
}

export function ResultPanel({ result, error, pending }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  if (pending) {
    return (
      <div className="results">
        <div className="judging">
          <span className="pulse" /> {pending === "run" ? "Running sample tests…" : "Judging against hidden tests…"}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="results">
        <p className="error-box">{error}</p>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="results">
        <p className="muted">Run your code against the examples, then submit it for the hidden tests.</p>
      </div>
    );
  }

  const ok = result.verdict === "accepted";
  const shown: TestResult | undefined =
    result.tests.find((t) => t.ordinal === selected) ??
    result.tests.find((t) => t.isSample && t.verdict !== "accepted") ??
    result.tests.find((t) => t.isSample);

  return (
    <div className="results">
      <div className="verdict-row">
        <span className={`verdict ${ok ? "ok" : "bad"}`}>{VERDICT_LABEL[result.verdict]}</span>
        <span className="muted">
          {result.passed}/{result.total} {result.mode === "run" ? "sample" : ""} tests passed
          {result.maxTimeMs !== null && ` · max ${result.maxTimeMs} ms`}
        </span>
      </div>

      {result.compileOutput && <pre className="console error">{result.compileOutput}</pre>}

      {!result.compileOutput && (
        <>
          <div className="test-chips">
            {result.tests.map((t) => (
              <button
                key={t.ordinal}
                className={`chip ${t.verdict === "accepted" ? "ok" : "bad"} ${shown?.ordinal === t.ordinal ? "active" : ""}`}
                onClick={() => setSelected(t.ordinal)}
                title={`Test ${t.ordinal}: ${VERDICT_LABEL[t.verdict]}${t.isSample ? "" : " (hidden)"}`}
              >
                {t.isSample ? `#${t.ordinal}` : "🔒"} {SHORT[t.verdict]}
              </button>
            ))}
          </div>

          {shown && shown.input !== undefined ? (
            <div className="io-grid three">
              <div>
                <label>Input</label>
                <pre>{shown.input}</pre>
              </div>
              <div>
                <label>Expected</label>
                <pre>{shown.expectedOutput}</pre>
              </div>
              <div>
                <label>Your output</label>
                <pre className={shown.verdict === "accepted" ? "" : "diff-bad"}>{shown.actualOutput || " "}</pre>
              </div>
              {shown.stderr && (
                <div className="full">
                  <label>stderr</label>
                  <pre className="console error">{shown.stderr}</pre>
                </div>
              )}
            </div>
          ) : (
            selected !== null && <p className="muted">Hidden test. Its input and output stay secret.</p>
          )}
        </>
      )}
    </div>
  );
}
