"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppNav from "./AppNav";
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

  async function saveNote() {
    await screen.runAction(
      "save",
      async () => {
        await persistNote();
      },
      { rethrow: false },
    );
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

  const statusText = screen.isBusy ? (statusTextByAction[screen.activeAction] || "выполняю действие...") : "";

  return (
    <>
      <header>
        <h1>Note</h1>
        <span className="subtitle">детали заметки и генерация</span>
      </header>
      <AppNav />

      <div className="container note-screen">
        <div className="status-strip" aria-live="polite">
          {statusText || "заметка готова к редактированию"}
        </div>

        <div className="artifact-block">
          <div className="artifact-meta wrap-meta">
            <span className="mono-wrap">ID: {noteId}</span>
            <span>{note?.created_at ? new Date(note.created_at).toLocaleString() : ""}</span>
          </div>
          <div className="style-controls">
            <Link href="/" className="btn">← к истории</Link>
            <button className="btn" type="button" onClick={saveNote} disabled={screen.isBusy}>
              сохранить заметку
            </button>
            <button className="btn btn-danger" type="button" onClick={deleteCurrentNote} disabled={screen.isBusy}>
              удалить заметку
            </button>
          </div>
        </div>

        <div className="step-block">
          <div className="step-pill">шаг 1</div>
          <div className="block-label">Summarize</div>
          <div className="summary-block">
            <input
              className="style-name-input"
              value={heading}
              onChange={(event) => setHeading(event.target.value)}
              placeholder="заголовок"
            />
            <textarea
              className="style-area"
              value={summaryText}
              onChange={(event) => setSummaryText(event.target.value)}
              placeholder="саммари"
            />
            <div className="style-controls desktop-actions">
              <button className="btn" type="button" onClick={regenerateSummary} disabled={!text.trim() || screen.isBusy}>
                обновить саммари
              </button>
              <button className="btn" type="button" onClick={saveNote} disabled={screen.isBusy}>
                сохранить заметку
              </button>
            </div>
          </div>
        </div>

        <div className="step-block">
          <div className="step-pill">шаг 2</div>
          <div className="block-label">Generate</div>
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

            <div className="style-controls desktop-actions">
              <button className="btn btn-primary" type="button" onClick={runGenerate} disabled={!canGenerate}>
                {screen.activeAction === "generate" ? "генерирую..." : "сгенерировать пост"}
              </button>
            </div>
          </div>
        </div>

        <div className="step-block">
          <div className="step-pill">шаг 3</div>
          <div className="block-label">Result</div>
          <div className="post-block">
            <div className="post-output">{generatedPost || <span className="placeholder">пост появится здесь...</span>}</div>
          </div>
        </div>

        <details className="collapsible-block">
          <summary className="collapsible-summary">
            Похожие заметки
            <span className="count-badge">{similarNotes.length}</span>
          </summary>
          <div className="artifact-block">
            {similarNotes.length ? (
              <div className="artifact-list">
                {similarNotes.map((item) => (
                  <Link key={item.note_id} className="artifact-item" href={`/notes/${item.note_id}`}>
                    <div className="artifact-meta">
                      <span>score {(item.similarity_score || 0).toFixed(2)}</span>
                    </div>
                    <div className="artifact-heading">{item.heading || "Без заголовка"}</div>
                    <div className="artifact-post">{item.summary || "Без саммари"}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <span className="placeholder">похожие заметки пока не найдены</span>
            )}
          </div>
        </details>

        {note?.posts?.length ? (
          <details className="collapsible-block" open>
            <summary className="collapsible-summary">
              История генераций
              <span className="count-badge">{note.posts.length}</span>
            </summary>
            <div className="artifact-block">
              <div className="artifact-list">
                {note.posts.map((item) => (
                  <div key={item.id} className="artifact-item">
                    <div className="artifact-meta wrap-meta">
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                      <span>{item.length}</span>
                    </div>
                    <div className="artifact-post">{item.post_text}</div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        ) : null}

        <section
          className={`floating-compose-panel note-floating-panel ${showMoreOptions ? "expanded" : "collapsed"}`}
          aria-label="Панель дополнения заметки"
        >
          <div className="floating-compose-header">
            <div>
              <div className="step-pill">дополнить заметку</div>
              <div className="block-label">Запиши или загрузи аудио</div>
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

          {showMoreOptions ? (
            <div className="floating-compose-extra">
              <div className="step-block">
                <div className="block-label">Редактирование текста заметки</div>
                <div className="transcript-block">
                  <textarea className="manual-area" value={text} onChange={(event) => setText(event.target.value)} />
                </div>
                <div className="floating-compose-actions">
                  <button className="btn" type="button" onClick={saveNote} disabled={screen.isBusy}>
                    сохранить заметку
                  </button>
                  <button className="btn" type="button" onClick={regenerateSummary} disabled={!text.trim() || screen.isBusy}>
                    обновить саммари
                  </button>
                  <button className="btn btn-primary" type="button" onClick={runGenerate} disabled={!canGenerate}>
                    {screen.activeAction === "generate" ? "генерирую..." : "сгенерировать пост"}
                  </button>
                  <button className="btn btn-danger" type="button" onClick={deleteCurrentNote} disabled={screen.isBusy}>
                    удалить заметку
                  </button>
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
