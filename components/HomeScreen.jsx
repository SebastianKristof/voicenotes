"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TranscribePanel from "./TranscribePanel";
import { createNote, listNotes, listTags, summarize } from "../lib/client-api";
import { formatNotesExport, EXPORT_SEPARATORS } from "../lib/note-export";
import { isNotesCacheFresh, mergeNotePages, readNotesCache, writeNotesCache } from "../lib/note-cache";
import { SCREEN_STATUS, useScreenState } from "../lib/use-screen-state";

const PAGE_SIZE = 30;
const MANUAL_DRAFT_KEY = "voicenotes.manual-draft.v1";

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
  const [tags, setTags] = useState([]);
  const [nextCursor, setNextCursor] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [summaryHeading, setSummaryHeading] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [separatorMode, setSeparatorMode] = useState("blank");
  const [customSeparator, setCustomSeparator] = useState("---");
  const [filterTag, setFilterTag] = useState("");
  const [query, setQuery] = useState("");
  const sentinelRef = useRef(null);
  const didRunFilterEffectRef = useRef(false);

  useEffect(() => {
    const cache = readNotesCache();
    if (cache?.notes?.length) {
      setNotes(cache.notes);
      setNextCursor(cache.nextCursor);
    }
    const savedDraft = localStorage.getItem(MANUAL_DRAFT_KEY);
    if (savedDraft) setText(savedDraft);
    void loadInitialData(!isNotesCacheFresh(cache));
  }, []);

  useEffect(() => {
    localStorage.setItem(MANUAL_DRAFT_KEY, text);
  }, [text]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !nextCursor || screen.isBusy || isLoadingMore) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMoreNotes();
      }
    }, { rootMargin: "320px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [nextCursor, screen.isBusy, isLoadingMore, filterTag, query]);

  useEffect(() => {
    if (!didRunFilterEffectRef.current) {
      didRunFilterEffectRef.current = true;
      return undefined;
    }
    const timeout = setTimeout(() => {
      void loadHistoryWithStatus();
    }, 250);
    return () => clearTimeout(timeout);
  }, [filterTag, query]);

  async function fetchHistory({ background = false } = {}) {
    const [notesPage, loadedTags] = await Promise.all([
      listNotes({ limit: PAGE_SIZE, tag: filterTag, q: query }),
      listTags(),
    ]);
    setTags(loadedTags);
    setNotes(notesPage.notes);
    setNextCursor(notesPage.nextCursor);
    setSelectedIds([]);
    if (!filterTag && !query) writeNotesCache(notesPage.notes, notesPage.nextCursor);
    if (!background) screen.clearError();
  }

  async function loadInitialData(forceStatus) {
    if (!forceStatus) {
      await fetchHistory({ background: true }).catch(() => {});
      return;
    }
    await loadHistoryWithStatus();
  }

  async function loadHistoryWithStatus() {
    await screen.runAction("load", fetchHistory, {
      phase: SCREEN_STATUS.LOADING,
      rethrow: false,
    });
  }

  async function loadMoreNotes() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await listNotes({ limit: PAGE_SIZE, cursor: nextCursor, tag: filterTag, q: query });
      setNotes((prev) => {
        const merged = mergeNotePages(prev, page.notes);
        if (!filterTag && !query) writeNotesCache(merged, page.nextCursor);
        return merged;
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      screen.setError?.(error.message);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleTranscribed({ text: nextText, sourceType, language }) {
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
          meta: {
            transcription: {
              sourceType,
              language,
              createdAt: new Date().toISOString(),
            },
          },
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

        localStorage.removeItem(MANUAL_DRAFT_KEY);
        setText("");
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
  const selectedNotes = useMemo(
    () => notes.filter((note) => selectedIds.includes(note.id)),
    [notes, selectedIds],
  );
  const canSave = !!text.trim() && !screen.isBusy;
  const canSummarize = !!text.trim() && !screen.isBusy;
  const selectionMode = selectedIds.length > 0;
  const exportSeparator = separatorMode === "custom"
    ? `\n\n${customSeparator}\n\n`
    : EXPORT_SEPARATORS[separatorMode];

  const statusTextByAction = {
    load: "загружаю заметки...",
    transcribe: "создаю заметку из транскриба...",
    summarize: "обновляю саммари...",
    save: "сохраняю заметку...",
  };

  const statusText = screen.isBusy ? (statusTextByAction[screen.activeAction] || "выполняю действие...") : "";

  function toggleSelected(id) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }

  async function copySelectedNotes() {
    if (!selectedNotes.length || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(formatNotesExport(selectedNotes, exportSeparator));
  }

  function downloadSelectedNotes() {
    if (!selectedNotes.length) return;
    const blob = new Blob([formatNotesExport(selectedNotes, exportSeparator)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voicenotes-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

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

          <div className="feed-tools">
            <input
              className="style-name-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="поиск по тексту"
            />
            <select className="style-select" value={filterTag} onChange={(event) => setFilterTag(event.target.value)}>
              <option value="">все теги</option>
              {tags.map((tag) => (
                <option key={tag.slug} value={tag.slug}>{tag.name}</option>
              ))}
            </select>
          </div>

          {selectionMode ? (
            <div className="selection-toolbar">
              <span>{selectedIds.length} выбрано</span>
              <select value={separatorMode} onChange={(event) => setSeparatorMode(event.target.value)}>
                <option value="blank">пустая строка</option>
                <option value="rule">---</option>
                <option value="custom">свой</option>
              </select>
              {separatorMode === "custom" ? (
                <input value={customSeparator} onChange={(event) => setCustomSeparator(event.target.value)} />
              ) : null}
              <button className="btn" type="button" onClick={copySelectedNotes}>копировать</button>
              <button className="btn" type="button" onClick={downloadSelectedNotes}>экспорт</button>
              <button className="btn" type="button" onClick={() => setSelectedIds([])}>снять</button>
            </div>
          ) : null}

          {historyItems.length ? (
            <div className="note-feed">
              {historyItems.map((item) => {
                const selected = selectedIds.includes(item.id);
                const content = (
                  <>
                    <label className="note-select" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Выбрать ${item.heading || "заметку"}`}
                      />
                    </label>
                    <div className="note-feed-body">
                      <div className="artifact-meta">
                        <span>{formatNoteTime(item.created_at)}</span>
                        <span>{item.dictated_text ? "recording" : "manual"}</span>
                      </div>
                      <div className="artifact-heading">{item.heading || "Без заголовка"}</div>
                      {item.tags?.length ? (
                        <div className="tag-row">
                          {item.tags.map((tag) => <span key={tag.slug} className="tag-chip">{tag.name}</span>)}
                        </div>
                      ) : null}
                      <div className="artifact-post note-preview">{notePreview(item)}</div>
                    </div>
                  </>
                );
                return selectionMode ? (
                  <div key={item.id} className={`note-feed-item selectable ${selected ? "selected" : ""}`} onClick={() => toggleSelected(item.id)}>
                    {content}
                  </div>
                ) : (
                  <Link key={item.id} className="note-feed-item selectable" href={`/notes/${item.id}`}>
                    {content}
                  </Link>
                );
              })}
              {nextCursor ? <div ref={sentinelRef} className="lazy-sentinel">{isLoadingMore ? "загружаю еще..." : ""}</div> : null}
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
