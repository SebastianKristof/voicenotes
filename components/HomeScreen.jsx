"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppNav from "./AppNav";
import TranscribePanel from "./TranscribePanel";
import { createNote, listNotes, summarize } from "../lib/client-api";

export default function HomeScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [summaryHeading, setSummaryHeading] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setNotes(await listNotes());
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleTranscribed({ text: nextText, sourceType }) {
    setText(nextText);
    setError("");

    const nextSummary = await summarize(nextText).catch(() => ({ heading: "", summary: "" }));
    setSummaryHeading(nextSummary.heading);
    setSummaryText(nextSummary.summary);

    const note = await createNote({
      sourceType,
      inputText: nextText,
      dictatedText: nextText,
      heading: nextSummary.heading,
      summary: nextSummary.summary,
    });

    await load();
    router.push(`/notes/${note.id}`);
  }

  async function saveManualNote() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setIsSaving(true);
    setError("");
    try {
      const nextSummary = summaryHeading || summaryText ? { heading: summaryHeading, summary: summaryText } : await summarize(trimmed);
      setSummaryHeading(nextSummary.heading);
      setSummaryText(nextSummary.summary);

      const note = await createNote({
        sourceType: "manual",
        inputText: trimmed,
        dictatedText: null,
        heading: nextSummary.heading,
        summary: nextSummary.summary,
      });

      await load();
      router.push(`/notes/${note.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <header>
        <h1>Voice → Post</h1>
        <span className="subtitle">история и новая заметка</span>
      </header>
      <AppNav />

      <div className="container">
        <div>
          <div className="block-label">История заметок</div>
          <div className="artifact-block">
            {notes.length ? (
              <div className="artifact-list">
                {notes.map((item) => (
                  <Link key={item.id} className="artifact-item" href={`/notes/${item.id}`}>
                    <div className="artifact-meta">
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    <div className="artifact-heading">{item.heading || "Без заголовка"}</div>
                    <div className="artifact-post">{item.summary || "Без саммари"}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <span className="placeholder">пока нет заметок</span>
            )}
          </div>
        </div>

        <TranscribePanel onText={handleTranscribed} disabled={isSaving} />

        <div>
          <div className="block-label">Или введи текст вручную</div>
          <div className="transcript-block">
            <textarea
              className="manual-area"
              placeholder="вставь или напиши заметку здесь..."
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="block-label">Черновик саммари</div>
          <div className="summary-block">
            <h3 className="summary-heading">{summaryHeading || "Без заголовка"}</h3>
            <p className="summary-text">{summaryText || "Сводка появится после сохранения или транскриба"}</p>
            <div className="style-controls">
              <button className="btn btn-primary" type="button" onClick={saveManualNote} disabled={!text.trim() || isSaving}>
                сохранить и открыть
              </button>
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  const s = await summarize(text.trim());
                  setSummaryHeading(s.heading);
                  setSummaryText(s.summary);
                }}
                disabled={!text.trim() || isSaving}
              >
                обновить саммари
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="error-box">{error}</div> : null}
      </div>
    </>
  );
}
