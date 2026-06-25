"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function formatNoteTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function notePreview(item) {
  return item.summary || item.input_text || "Без саммари";
}

export default function HomeScreen() {
  const router = useRouter();
  const screen = useScreenState();
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [summaryHeading, setSummaryHeading] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  useEffect(() => {
    void loadHistoryWithStatus();
  }, []);

  async function fetchHistory() {
    setNotes(await listNotes());
  }

  async function loadHistoryWithStatus() {
    await screen.runAction("load", fetchHistory, {
      phase: SCREEN_STATUS.LOADING,
      rethrow: false,
    });
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

        await fetchHistory();
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

        await fetchHistory();
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

  const historyItems = notes;
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
      <header className="app-header">
        <div>
          <h1>Voice → Post</h1>
          <span className="subtitle">запись, заметка, саммари</span>
        </div>
        <Link className="icon-btn text-icon-btn" href="/settings" aria-label="Настройки">
          ⚙
        </Link>
      </header>

      <div className="container home-screen">
        {statusText ? (
          <div className="status-strip" aria-live="polite">
            {statusText}
          </div>
        ) : null}

        <section className="feed-section" aria-label="История заметок">
          <div className="feed-header">
            <div>
              <div className="block-label">История заметок</div>
              <div className="feed-count">{notes.length} заметок</div>
            </div>
          </div>

          {historyItems.length ? (
            <div className="note-feed">
              {historyItems.map((item) => (
                <Link key={item.id} className="note-feed-item" href={`/notes/${item.id}`}>
                  <div className="artifact-meta">
                    <span>{formatNoteTime(item.created_at)}</span>
                    <span>{item.dictated_text ? "recording" : "manual"}</span>
                  </div>
                  <div className="artifact-heading">{item.heading || "Без заголовка"}</div>
                  <div className="artifact-post note-preview">{notePreview(item)}</div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-feed">пока нет заметок</div>
          )}
        </section>

        <section
          className={`floating-compose-panel home-floating-panel ${showMoreOptions ? "expanded" : "collapsed"}`}
          aria-label="Панель новой заметки"
        >
          <div className="floating-compose-header">
            <div>
              <div className="step-pill">новая заметка</div>
              <div className="block-label">Запиши аудио</div>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => setShowMoreOptions((prev) => !prev)}
              aria-expanded={showMoreOptions}
            >
              {showMoreOptions ? "скрыть опции" : "больше опций"}
            </button>
          </div>

          <TranscribePanel onText={handleTranscribed} disabled={screen.isBusy} compact={!showMoreOptions} />

          {showMoreOptions ? (
            <div className="floating-compose-extra">
              <div className="step-block">
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
                <div className="block-label">Черновик саммари</div>
                <div className="summary-block">
                  <h3 className="summary-heading">{summaryHeading || "Без заголовка"}</h3>
                  <p className="summary-text">{summaryText || "Сводка появится после сохранения или транскриба"}</p>
                  <div className="floating-compose-actions">
                    <button className="btn btn-primary" type="button" onClick={saveManualNote} disabled={!canSave}>
                      сохранить и открыть
                    </button>
                    <button className="btn" type="button" onClick={refreshSummary} disabled={!canSummarize}>
                      обновить саммари
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

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
