import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ProblemList } from "./pages/ProblemList";
import { ProblemPage } from "./pages/ProblemPage";
import "./styles.css";

function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="logo">
          <span className="logo-bracket">&lt;</span>code<span className="logo-accent">duel</span>
          <span className="logo-bracket">/&gt;</span>
        </Link>
        <nav>
          <Link to="/">Problems</Link>
          <span className="nav-soon" title="Coming in Milestone 3">
            Duel <em>soon</em>
          </span>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<ProblemList />} />
        <Route path="/problems/:slug" element={<ProblemPage />} />
      </Routes>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
