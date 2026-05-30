"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppNav from "./AppNav";
import TranscribePanel from "./TranscribePanel";
import { createNote, listNotes, summarize } from "../lib/client-api";
import { SCREEN_STATUS, useScreenState } from "../lib/use-screen-state";

function ensureNoteId(note, context) {
  const id = typeof note?.id === "string" ? note.id.trim() : "";
  if (!id) {
    throw new Error(`${context}: note id is empty`);
  }
  return id;
}

export default function HomeScreen() {
  const router = useRouter();
  const screen = useScreenState();
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [summaryHeading, setSummaryHeading] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    await screen.runAction(
      "load",
      async () => {
        setNotes(await listNotes());
      },
      { phase: SCREEN_STATUS.LOADING, rethrow: false },
    );
  }

  async function handleTranscribed({ text: nextText, sourceType }) {
    setText(nextText);
    screen.clearError();

    await screen.runAction(
      "transcribe",
      async () => {
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
        const noteId = ensureNoteId(note, "Failed to open note after transcription");

        await loadHistory();
        router.push(`/notes/${noteId}`);
      },
      { rethrow: false },
    );
  }

  async function saveManualNote() {
    const trimmed = text.trim();
    if (!trimmed) return;

    await screen.runAction(
      "save",
      async () => {
        const nextSummary = summaryHeading || summaryText
          ? { heading: summaryHeading, summary: summaryText }
          : await summarize(trimmed);
        setSummaryHeading(nextSummary.heading);
        setSummaryText(nextSummary.summary);

        const note = await createNote({
          sourceType: "manual",
          inputText: trimmed,
          dictatedText: null,
          heading: nextSummary.heading,
          summary: nextSummary.summary,
        });
        const noteId = ensureNoteId(note, "Failed to open note after save");

        await loadHistory();
        router.push(`/notes/${noteId}`);
      },
      { rethrow: false },
    );
  }

  async function refreshSummary() {
    const trimmed = text.trim();
    if (!trimmed) return;

    await screen.runAction(
      "summarize",
      async () => {
        const nextSummary = await summarize(trimmed);
        setSummaryHeading(nextSummary.heading);
        setSummaryText(nextSummary.summary);
      },
      { rethrow: false },
    );
  }

  const historyItems = showAllHistory ? notes : notes.slice(0, 3);
  const hasMoreHistory = notes.length > 3;
  const canSave = !!text.trim() && !screen.isBusy;
  const canSummarize = !!text.trim() && !screen.isBusy;

  const statusTextByAction = {
    load: "загружаю заметки...",
    transcribe: "создаю заметку из транскриба...",
    summarize: "обновляю саммари...",
    save: "сохраняю заметку...",
  };

  const statusText = screen.isBusy ? (statusTextByAction[screen.activeAction] || "выполняю действие...") : "";

  return (
    <>
      <header>
        <h1>Voice → Post</h1>
        <span className="subtitle">запись, заметка, саммари</span>
      </header>
      <AppNav />

      <div className="container">
        <div className="status-strip" aria-live="polite">
          {statusText || "готово к новой заметке"}
        </div>

        <div className="step-block">
          <div className="step-pill">шаг 1</div>
          <div className="block-label">Запиши или загрузи аудио</div>
          <TranscribePanel onText={handleTranscribed} disabled={screen.isBusy} />
        </div>

        <div className="step-block">
          <div className="step-pill">шаг 2</div>
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

        <div className="step-block">
          <div className="step-pill">шаг 3</div>
          <div className="block-label">Черновик саммари</div>
          <div className="summary-block">
            <h3 className="summary-heading">{summaryHeading || "Без заголовка"}</h3>
            <p className="summary-text">{summaryText || "Сводка появится после сохранения или транскриба"}</p>
            <div className="style-controls desktop-actions">
              <button className="btn btn-primary" type="button" onClick={saveManualNote} disabled={!canSave}>
                сохранить и открыть
              </button>
              <button className="btn" type="button" onClick={refreshSummary} disabled={!canSummarize}>
                обновить саммари
              </button>
            </div>
          </div>
        </div>

        <details className="collapsible-block" open>
          <summary className="collapsible-summary">
            История заметок
            <span className="count-badge">{notes.length}</span>
          </summary>
          <div className="artifact-block">
            {historyItems.length ? (
              <div className="artifact-list">
                {historyItems.map((item) => (
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
            {hasMoreHistory ? (
              <div className="style-controls">
                <button className="btn" type="button" onClick={() => setShowAllHistory((prev) => !prev)}>
                  {showAllHistory ? "показать меньше" : "показать все"}
                </button>
              </div>
            ) : null}
          </div>
        </details>

        <div className="mobile-action-bar">
          <button className="btn btn-primary" type="button" onClick={saveManualNote} disabled={!canSave}>
            сохранить и открыть
          </button>
          <button className="btn" type="button" onClick={refreshSummary} disabled={!canSummarize}>
            обновить саммари
          </button>
        </div>

        {screen.error ? (
          <div className="error-box">
            {screen.error}
            <div className="style-controls">
              <button className="btn" type="button" onClick={screen.clearError}>
                скрыть
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
