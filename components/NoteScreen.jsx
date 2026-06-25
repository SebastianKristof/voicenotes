"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ActionMenu from "./ActionMenu";
import TranscribePanel from "./TranscribePanel";
import {
  createNotePost,
  generatePost,
  getNote,
  listSimilar,
  listStyles,
  patchNote,
  removeNote,
  summarize,
} from "../lib/client-api";
import { appendTranscribedText, deriveLatestPostDraft } from "../lib/note-utils";
import { SCREEN_STATUS, useScreenState } from "../lib/use-screen-state";

const LENGTH_OPTIONS = [
  { id: "short", label: "короткий" },
  { id: "medium", label: "средний" },
  { id: "long", label: "длинный" },
];

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

export default function NoteScreen({ noteId }) {
  const router = useRouter();
  const screen = useScreenState();

  const [note, setNote] = useState(null);
  const [similarNotes, setSimilarNotes] = useState([]);
  const [styles, setStyles] = useState([]);
  const [text, setText] = useState("");
  const [heading, setHeading] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [styleName, setStyleName] = useState("");
  const [styleInstructions, setStyleInstructions] = useState("");
  const [length, setLength] = useState("medium");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [generatedPost, setGeneratedPost] = useState("");
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);

  const canGenerate = useMemo(
    () => !!text.trim() && !!styleInstructions.trim() && !screen.isBusy,
    [text, styleInstructions, screen.isBusy],
  );

  useEffect(() => {
    void loadAllWithStatus();
  }, [noteId]);

  async function fetchAllData() {
    const [loadedNote, loadedStyles, loadedSimilar] = await Promise.all([
      getNote(noteId),
      listStyles(),
      listSimilar(noteId, 5),
    ]);

    const latestDraft = deriveLatestPostDraft(loadedNote, loadedStyles);
    const fallbackStyle = loadedStyles[0] || null;
    const styleDraft =
      latestDraft.selectedStyleId || !fallbackStyle
        ? latestDraft
        : {
            ...latestDraft,
            selectedStyleId: fallbackStyle.id,
            styleName: fallbackStyle.name,
            styleInstructions: fallbackStyle.instructions,
          };

    setNote(loadedNote);
    setStyles(loadedStyles);
    setSimilarNotes(loadedSimilar);
    setText(loadedNote.input_text || "");
    setHeading(loadedNote.heading || "");
    setSummaryText(loadedNote.summary || "");
    setGeneratedPost(loadedNote.posts?.[0]?.post_text || "");
    setLength(styleDraft.length);
    setExtraInstructions(styleDraft.extraInstructions);
    setStyleName(styleDraft.styleName);
    setStyleInstructions(styleDraft.styleInstructions);
    setSelectedStyleId(styleDraft.selectedStyleId);
  }

  async function loadAllWithStatus() {
    await screen.runAction("load", fetchAllData, {
      phase: SCREEN_STATUS.LOADING,
      rethrow: false,
    });
  }

  async function persistNote() {
    const updated = await patchNote(noteId, {
      inputText: text.trim(),
      dictatedText: text.trim(),
      heading: heading || null,
      summary: summaryText || null,
    });

    setNote((prev) => ({ ...(prev || {}), ...updated }));
  }

  async function saveTranscript() {
    await screen.runAction(
      "save",
      async () => {
        await persistNote();
        setIsEditingTranscript(false);
      },
      { rethrow: false },
    );
  }

  async function copyTranscript() {
    if (!text.trim() || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(text);
    setShowActions(false);
  }

  async function regenerateSummary() {
    if (!text.trim()) return;

    await screen.runAction(
      "summarize",
      async () => {
        const nextSummary = await summarize(text.trim());
        setHeading(nextSummary.heading);
        setSummaryText(nextSummary.summary);
      },
      { rethrow: false },
    );
  }

  async function onTranscribed({ text: nextText }) {
    const mergedInputText = appendTranscribedText(text, nextText);
    const mergedDictatedText = appendTranscribedText(note?.dictated_text || "", nextText);
    setText(mergedInputText);

    await screen.runAction(
      "transcribe",
      async () => {
        const nextSummary = await summarize(mergedInputText).catch(() => ({ heading: "", summary: "" }));
        if (nextSummary.heading || nextSummary.summary) {
          setHeading(nextSummary.heading);
          setSummaryText(nextSummary.summary);
        }

        await patchNote(noteId, {
          inputText: mergedInputText,
          dictatedText: mergedDictatedText,
          heading: nextSummary.heading || heading,
          summary: nextSummary.summary || summaryText,
        });

        await fetchAllData();
      },
      { rethrow: false },
    );
  }

  async function deleteCurrentNote() {
    if (typeof window !== "undefined") {
      const accepted = window.confirm("Удалить заметку без возможности восстановления?");
      if (!accepted) return;
    }

    await screen.runAction(
      "delete",
      async () => {
        await removeNote(noteId);
        router.push("/");
      },
      { rethrow: false },
    );
  }

  async function runGenerate() {
    if (!canGenerate) return;

    await screen.runAction(
      "generate",
      async () => {
        await persistNote();

        const postText = await generatePost({
          text: text.trim(),
          styleInstructions: styleInstructions.trim(),
          extraInstructions: extraInstructions.trim(),
          length,
        });

        const selectedStyle = styles.find((item) => item.id === selectedStyleId) || null;
        await createNotePost(noteId, {
          postText,
          length,
          extraInstructions: extraInstructions.trim() || null,
          styleId: selectedStyle?.id || null,
          styleName: selectedStyle?.name || styleName || null,
          styleInstructions: styleInstructions.trim(),
          generationSettings: {
            length,
            extraInstructions: extraInstructions.trim() || null,
          },
        });

        setGeneratedPost(postText);
        await fetchAllData();
      },
      { rethrow: false },
    );
  }

  const statusTextByAction = {
    load: "загружаю данные заметки...",
    transcribe: "обновляю заметку из транскриба...",
    summarize: "генерирую саммари...",
    save: "сохраняю заметку...",
    generate: "генерирую пост...",
    delete: "удаляю заметку...",
  };
  const statusText = screen.isBusy ? statusTextByAction[screen.activeAction] || "выполняю действие..." : "";

  return (
    <>
      <header className="app-header note-header">
        <Link href="/" className="icon-btn text-icon-btn" aria-label="К истории">←</Link>
        <div className="note-header-title">
          <h1>Note</h1>
          <span className="subtitle">детали заметки</span>
        </div>
        <div className="menu-wrap">
          <button
            id="note-actions-button"
            className="icon-btn"
            type="button"
            aria-label="Действия заметки"
            aria-expanded={showActions}
            onClick={() => setShowActions((prev) => !prev)}
          >
            ...
          </button>
          <ActionMenu open={showActions} labelledBy="note-actions-button">
            <button type="button" onClick={copyTranscript}>копировать транскрипт</button>
            <button type="button" onClick={() => { setIsEditingTranscript(true); setShowActions(false); }}>редактировать</button>
            <button type="button" onClick={() => { setShowCreatePost(true); setShowActions(false); }}>создать пост</button>
            <button type="button" onClick={() => { void regenerateSummary(); setShowActions(false); }}>обновить саммари</button>
            <button className="danger" type="button" onClick={() => { setShowActions(false); void deleteCurrentNote(); }}>удалить заметку</button>
          </ActionMenu>
        </div>
      </header>

      <div className="container note-screen">
        {statusText ? (
          <div className="status-strip" aria-live="polite">
            {statusText}
          </div>
        ) : null}

        <section className="reader-block">
          <div className="artifact-meta wrap-meta">
            <span>{formatDate(note?.created_at)}</span>
            <span>{note?.dictated_text ? "recording" : "manual"}</span>
          </div>

          {isEditingTranscript ? (
            <>
              <input
                className="style-name-input title-edit"
                value={heading}
                onChange={(event) => setHeading(event.target.value)}
                placeholder="заголовок"
              />
              <textarea
                className="transcript-edit-area"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="транскрипт"
              />
              <textarea
                className="style-area"
                value={summaryText}
                onChange={(event) => setSummaryText(event.target.value)}
                placeholder="саммари"
              />
              <div className="reader-actions">
                <button className="btn btn-primary" type="button" onClick={saveTranscript} disabled={screen.isBusy}>
                  сохранить
                </button>
                <button className="btn" type="button" onClick={() => setIsEditingTranscript(false)} disabled={screen.isBusy}>
                  отменить
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="note-title">{heading || "Без заголовка"}</h2>
              {summaryText ? <p className="summary-text reader-summary">{summaryText}</p> : null}
              <div className="transcript-reader">{text || <span className="placeholder">транскрипт пуст</span>}</div>
              <div className="reader-actions">
                <button className="btn" type="button" onClick={copyTranscript} disabled={!text.trim()}>
                  копировать
                </button>
                <button className="btn" type="button" onClick={() => setIsEditingTranscript(true)}>
                  редактировать
                </button>
                <button className="btn btn-primary" type="button" onClick={() => setShowCreatePost((prev) => !prev)}>
                  создать пост
                </button>
              </div>
            </>
          )}
        </section>

        {showCreatePost ? (
          <section className="create-post-panel">
            <div className="block-label">Create post</div>
            <div className="style-block">
              <div className="style-controls">
                <select
                  className="style-select"
                  value={selectedStyleId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setSelectedStyleId(id);
                    const style = styles.find((item) => item.id === id);
                    if (style) {
                      setStyleName(style.name);
                      setStyleInstructions(style.instructions);
                    }
                  }}
                >
                  <option value="">выбери стиль</option>
                  {styles.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <Link className="btn" href="/settings">управлять стилями</Link>
              </div>

              <textarea
                className="style-area"
                value={styleInstructions}
                onChange={(event) => setStyleInstructions(event.target.value)}
                placeholder="инструкции стиля"
              />

              <div className="length-row">
                {LENGTH_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`tone-chip ${length === option.id ? "active" : ""}`}
                    onClick={() => setLength(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <textarea
                className="style-area"
                value={extraInstructions}
                onChange={(event) => setExtraInstructions(event.target.value)}
                placeholder="дополнительные инструкции"
              />

              <div className="style-controls">
                <button className="btn btn-primary" type="button" onClick={runGenerate} disabled={!canGenerate}>
                  {screen.activeAction === "generate" ? "генерирую..." : "сгенерировать пост"}
                </button>
                <button className="btn" type="button" onClick={() => setShowCreatePost(false)}>
                  скрыть
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {generatedPost ? (
          <section className="post-block">
            <div className="block-label">Последний пост</div>
            <div className="post-output">{generatedPost}</div>
          </section>
        ) : null}

        {note?.posts?.length ? (
          <section>
            <div className="block-label">История генераций</div>
            <div className="artifact-list">
              {note.posts.map((item) => (
                <Link key={item.id} className="artifact-item" href={`/notes/${noteId}/posts/${item.id}`}>
                  <div className="artifact-meta wrap-meta">
                    <span>{formatDate(item.created_at)}</span>
                    <span>{item.length}</span>
                  </div>
                  <div className="artifact-post">{item.post_text}</div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="block-label">Похожие заметки</div>
          <div className="related-strip">
            {similarNotes.length ? similarNotes.map((item) => (
              <Link key={item.note_id} className="related-card" href={`/notes/${item.note_id}`}>
                <div className="artifact-meta">score {(item.similarity_score || 0).toFixed(2)}</div>
                <div className="artifact-heading">{item.heading || "Без заголовка"}</div>
                <div className="artifact-post note-preview">{item.summary || "Без саммари"}</div>
              </Link>
            )) : (
              <span className="placeholder">похожие заметки пока не найдены</span>
            )}
          </div>
        </section>

        <section
          className={`floating-compose-panel note-floating-panel ${showMoreOptions ? "expanded" : "collapsed"}`}
          aria-label="Панель дополнения заметки"
        >
          <div className="floating-compose-header">
            <div>
              <div className="step-pill">дополнить заметку</div>
              <div className="block-label">Запиши продолжение</div>
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

          <TranscribePanel onText={onTranscribed} disabled={screen.isBusy} compact={!showMoreOptions} />
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
