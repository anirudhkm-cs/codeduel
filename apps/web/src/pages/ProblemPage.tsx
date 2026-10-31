import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { ResultPanel } from "../components/ResultPanel";
import type { Language, Problem, SubmissionResult } from "../types";

// Drafts are a per-browser convenience; storage may be unavailable, so never let it throw.
const draftKey = (slug: string, lang: string) => `codeduel:draft:${slug}:${lang}`;
const loadDraft = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const saveDraft = (key: string, code: string) => {
  try {
    localStorage.setItem(key, code);
  } catch {
    /* ignore */
  }
};

export function ProblemPage() {
  const { slug = "" } = useParams();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [langId, setLangId] = useState("python");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [pending, setPending] = useState<"run" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProblem(null);
    setResult(null);
    Promise.all([api.problem(slug), api.languages()])
      .then(([p, langs]) => {
        setProblem(p);
        setLanguages(langs);
      })
      .catch((e: Error) => setError(e.message));
  }, [slug]);

  const language = languages.find((l) => l.id === langId);

  // Load the saved draft (or the starter template) when the problem or language changes
  useEffect(() => {
    if (!language) return;
    setCode(loadDraft(draftKey(slug, language.id)) ?? language.starter);
  }, [slug, language]);

  const onChange = (value: string | undefined) => {
    const next = value ?? "";
    setCode(next);
    saveDraft(draftKey(slug, langId), next);
  };

  const send = useCallback(
    async (mode: "run" | "submit") => {
      if (pending) return;
      setPending(mode);
      setError(null);
      try {
        setResult(await api.submit({ problemSlug: slug, language: langId, source: code, mode }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPending(null);
      }
    },
    [pending, slug, langId, code],
  );

  // Ctrl/Cmd+Enter = Run, Ctrl/Cmd+Shift+Enter = Submit
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        sendRef.current(e.shiftKey ? "submit" : "run");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (error && !problem) return <main className="list-page"><p className="error-box">{error}</p></main>;
  if (!problem) return <main className="list-page"><p className="muted">Loading…</p></main>;

  return (
    <main className="workspace">
      <section className="statement">
        <div className="statement-head">
          <h1>{problem.title}</h1>
          <span className={`badge ${problem.difficulty}`}>{problem.difficulty}</span>
        </div>
        <p className="limits">
          Time limit {problem.timeLimitMs / 1000}s · Memory {Math.round(problem.memoryLimitKb / 1000)} MB
        </p>
        <div className="markdown">
          <ReactMarkdown>{problem.statementMd}</ReactMarkdown>
        </div>
        {problem.samples.map((s, i) => (
          <div className="sample" key={i}>
            <h3>Example {i + 1}</h3>
            <div className="io-grid">
              <div>
                <label>Input</label>
                <pre>{s.input}</pre>
              </div>
              <div>
                <label>Output</label>
                <pre>{s.output}</pre>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="editor-pane">
        <div className="toolbar">
          <select value={langId} onChange={(e) => setLangId(e.target.value)} aria-label="Language">
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            className="ghost"
            onClick={() => language && onChange(language.starter)}
            title="Reset to starter code"
          >
            Reset
          </button>
          <div className="spacer" />
          <button className="secondary" disabled={!!pending} onClick={() => send("run")} title="Ctrl/⌘ + Enter">
            {pending === "run" ? "Running…" : "Run samples"}
          </button>
          <button className="primary" disabled={!!pending} onClick={() => send("submit")} title="Ctrl/⌘ + Shift + Enter">
            {pending === "submit" ? "Judging…" : "Submit"}
          </button>
        </div>

        <div className="editor-wrap">
          <Editor
            theme="vs-dark"
            language={language?.monaco ?? "python"}
            value={code}
            onChange={onChange}
            options={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 4,
              automaticLayout: true,
            }}
          />
        </div>

        <ResultPanel result={result} error={error} pending={pending} />
      </section>
    </main>
  );
}
