"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppNav from "./AppNav";
import TranscribePanel from "./TranscribePanel";
import {
  createNotePost,
  generatePost,
  getNote,
  listSimilar,
  listStyles,
  patchNote,
  summarize,
} from "../lib/client-api";

const LENGTH_OPTIONS = [
  { id: "short", label: "короткий" },
  { id: "medium", label: "средний" },
  { id: "long", label: "длинный" },
];

export default function NoteScreen({ noteId }) {
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
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const canGenerate = useMemo(
    () => !!text.trim() && !!styleInstructions.trim() && !isGenerating,
    [text, styleInstructions, isGenerating],
  );

  useEffect(() => {
    void loadAll();
  }, [noteId]);

  async function loadAll() {
    try {
      const [loadedNote, loadedStyles, loadedSimilar] = await Promise.all([
        getNote(noteId),
        listStyles(),
        listSimilar(noteId, 5),
      ]);

      setNote(loadedNote);
      setStyles(loadedStyles);
      setSimilarNotes(loadedSimilar);

      setText(loadedNote.input_text || "");
      setHeading(loadedNote.heading || "");
      setSummaryText(loadedNote.summary || "");
      setGeneratedPost(loadedNote.posts?.[0]?.post_text || "");

      const latest = loadedNote.posts?.[0];
      if (latest) {
        setLength(latest.length || "medium");
        setExtraInstructions(latest.extra_instructions || "");
        setStyleName(latest.style_name || "");
        setStyleInstructions(latest.style_instructions || "");

        const style = loadedStyles.find((s) => s.name === latest.style_name);
        setSelectedStyleId(style?.id || "");
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveNote() {
    setIsSaving(true);
    setError("");
    try {
      const updated = await patchNote(noteId, {
        inputText: text.trim(),
        dictatedText: text.trim(),
        heading: heading || null,
        summary: summaryText || null,
      });
      setNote((prev) => ({ ...(prev || {}), ...updated }));
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function regenerateSummary() {
    if (!text.trim()) return;
    const s = await summarize(text.trim());
    setHeading(s.heading);
    setSummaryText(s.summary);
  }

  async function onTranscribed({ text: nextText }) {
    setText(nextText);
    const s = await summarize(nextText).catch(() => ({ heading: "", summary: "" }));
    if (s.heading || s.summary) {
      setHeading(s.heading);
      setSummaryText(s.summary);
    }
    await patchNote(noteId, {
      inputText: nextText,
      dictatedText: nextText,
      heading: s.heading || heading,
      summary: s.summary || summaryText,
    });
    await loadAll();
  }

  async function runGenerate() {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError("");
    try {
      await saveNote();

      const postText = await generatePost({
        text: text.trim(),
        styleInstructions: styleInstructions.trim(),
        extraInstructions: extraInstructions.trim(),
        length,
      });

      const selectedStyle = styles.find((s) => s.id === selectedStyleId) || null;

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
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <>
      <header>
        <h1>Note</h1>
        <span className="subtitle">детали заметки и генерация</span>
      </header>
      <AppNav />

      <div className="container">
        <div className="artifact-block">
          <div className="artifact-meta">
            <span>ID: {noteId}</span>
            <span>{note?.created_at ? new Date(note.created_at).toLocaleString() : ""}</span>
          </div>
          <div className="style-controls">
            <Link href="/" className="btn">← к истории</Link>
            <button className="btn" type="button" onClick={saveNote} disabled={isSaving}>
              сохранить заметку
            </button>
          </div>
        </div>

        <TranscribePanel onText={onTranscribed} disabled={isGenerating || isSaving} />

        <div>
          <div className="block-label">Текст заметки</div>
          <div className="transcript-block">
            <textarea className="manual-area" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="block-label">Заголовок и саммари</div>
          <div className="summary-block">
            <input
              className="style-name-input"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="заголовок"
            />
            <textarea
              className="style-area"
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              placeholder="саммари"
            />
            <div className="style-controls">
              <button className="btn" type="button" onClick={regenerateSummary} disabled={!text.trim()}>
                обновить саммари
              </button>
            </div>
          </div>
        </div>

        {similarNotes.length ? (
          <div>
            <div className="block-label">Похожие заметки</div>
            <div className="artifact-block">
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
            </div>
          </div>
        ) : null}

        <div>
          <div className="block-label">Параметры генерации</div>
          <div className="style-block">
            <div className="style-controls">
              <select
                className="style-select"
                value={selectedStyleId}
                onChange={(event) => {
                  const id = event.target.value;
                  setSelectedStyleId(id);
                  const style = styles.find((s) => s.id === id);
                  if (style) {
                    setStyleName(style.name);
                    setStyleInstructions(style.instructions);
                  }
                }}
              >
                <option value="">выбери стиль</option>
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Link className="btn" href="/settings">управлять стилями</Link>
            </div>

            <textarea
              className="style-area"
              value={styleInstructions}
              onChange={(e) => setStyleInstructions(e.target.value)}
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
              onChange={(e) => setExtraInstructions(e.target.value)}
              placeholder="дополнительные инструкции"
            />

            <button className="btn btn-primary" type="button" onClick={runGenerate} disabled={!canGenerate}>
              {isGenerating ? "генерирую..." : "сгенерировать пост"}
            </button>
          </div>
        </div>

        <div>
          <div className="block-label">Готовый пост</div>
          <div className="post-block">
            <div className="post-output">{generatedPost || <span className="placeholder">пост появится здесь...</span>}</div>
          </div>

          {note?.posts?.length ? (
            <div className="artifact-block" style={{ marginTop: 12 }}>
              <div className="block-label">История генераций</div>
              <div className="artifact-list">
                {note.posts.map((item) => (
                  <div key={item.id} className="artifact-item">
                    <div className="artifact-meta">
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                      <span>{item.length}</span>
                    </div>
                    <div className="artifact-post">{item.post_text}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="error-box">{error}</div> : null}
      </div>
    </>
  );
}
