"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const LENGTH_OPTIONS = [
  { id: "short", label: "короткий" },
  { id: "medium", label: "средний" },
  { id: "long", label: "длинный" },
];

const INITIAL_TRANSCRIPT_PLACEHOLDER = "текст появится после записи...";

function formatSeconds(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function createTempId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  const raw = (new URLSearchParams(window.location.search).get("debug") || "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function buildTranscribeError(data, status) {
  const base = data.error || `HTTP ${status}`;
  if (!isDebugEnabled() || !data.debug) return base;
  let details = "";
  try {
    details = JSON.stringify(data.debug, null, 2);
  } catch {
    details = String(data.debug);
  }
  return `${base}\n\nDEBUG:\n${details}`;
}

export default function VoiceToPostApp() {
  const [transcript, setTranscript] = useState("");
  const [manualText, setManualText] = useState("");
  const [post, setPost] = useState("");

  const [summaryHeading, setSummaryHeading] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recStatus, setRecStatus] = useState("нажми чтобы начать запись");
  const [micHint, setMicHint] = useState("");

  const [audioLevel, setAudioLevel] = useState(0);
  const [levelBars, setLevelBars] = useState(Array.from({ length: 14 }, () => 0.06));

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const [customStyleName, setCustomStyleName] = useState("");
  const [customStyleInstructions, setCustomStyleInstructions] = useState("");
  const [styles, setStyles] = useState([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");

  const [selectedLength, setSelectedLength] = useState("medium");
  const [extraInstructions, setExtraInstructions] = useState("");

  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [selectedNote, setSelectedNote] = useState(null);
  const [similarNotes, setSimilarNotes] = useState([]);

  const [lastRecordingUrl, setLastRecordingUrl] = useState("");
  const [lastRecordingName, setLastRecordingName] = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const analyserDataRef = useRef(null);
  const meterRafRef = useRef(null);
  const meterLastUpdateRef = useRef(0);
  const streamRef = useRef(null);
  const recordingUrlRef = useRef("");

  const currentText = useMemo(
    () => manualText.trim() || transcript.trim(),
    [manualText, transcript],
  );

  const canGenerate =
    !!currentText && !!customStyleInstructions.trim() && !isGenerating && !isTranscribing;

  useEffect(() => {
    void Promise.all([loadStyles(), loadNotes()]);
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      stopLevelMeter();
      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    };
  }, []);

  async function loadStyles() {
    const response = await fetch("/api/styles");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load styles");
    setStyles(data.styles || []);
  }

  async function loadNotes() {
    const response = await fetch("/api/notes");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load notes");
    const nextNotes = data.notes || [];
    setNotes(nextNotes);

    if (!selectedNoteId && nextNotes.length) {
      await selectNote(nextNotes[0].id);
    }
  }

  async function selectNote(noteId) {
    setSelectedNoteId(noteId);

    const noteResponse = await fetch(`/api/notes/${noteId}`);
    const noteData = await noteResponse.json();
    if (!noteResponse.ok) throw new Error(noteData.error || "Failed to load note");

    const note = noteData.note;
    setSelectedNote(note);
    setTranscript(note.dictated_text || "");
    setManualText(note.input_text || "");
    setSummaryHeading(note.heading || "");
    setSummaryText(note.summary || "");
    setPost(note.posts?.[0]?.post_text || "");

    const similarResponse = await fetch(`/api/notes/${noteId}/similar?limit=5`);
    const similarData = await similarResponse.json();
    if (similarResponse.ok) {
      setSimilarNotes(similarData.similar || []);
    } else {
      setSimilarNotes([]);
    }
  }

  async function refreshNoteDetails(noteId) {
    await Promise.all([loadNotes(), selectNote(noteId)]);
  }

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function resetRecordingUi() {
    clearTimer();
    setIsRecording(false);
    setRecSeconds(0);
    setAudioLevel(0);
    setLevelBars(Array.from({ length: 14 }, () => 0.06));
  }

  function stopLevelMeter() {
    if (meterRafRef.current) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // no-op
      }
      analyserRef.current = null;
    }

    analyserDataRef.current = null;

    if (audioContextRef.current) {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      context.close().catch(() => {
        // no-op
      });
    }
  }

  function startLevelMeter(stream) {
    try {
      stopLevelMeter();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioContext = new AudioCtx();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;
      sourceNode.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (!analyserRef.current || !analyserDataRef.current) return;

        analyserRef.current.getByteTimeDomainData(analyserDataRef.current);

        let sumSquares = 0;
        for (let i = 0; i < analyserDataRef.current.length; i += 1) {
          const normalized = (analyserDataRef.current[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / analyserDataRef.current.length);
        const normalizedLevel = Math.min(1, rms * 3.2);

        const now = performance.now();
        if (now - meterLastUpdateRef.current > 45) {
          meterLastUpdateRef.current = now;
          setAudioLevel(normalizedLevel);
          setLevelBars((prev) => [...prev.slice(1), normalizedLevel]);
        }

        meterRafRef.current = requestAnimationFrame(tick);
      };

      meterRafRef.current = requestAnimationFrame(tick);
    } catch {
      // non-blocking: recording still works without meter
    }
  }

  async function generateSummaryFromText(text) {
    if (!text) return null;

    setIsSummarizing(true);
    setSummaryHeading("");
    setSummaryText("");

    try {
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const heading = (data.heading || "").trim();
      const summary = (data.summary || "").trim();

      setSummaryHeading(heading);
      setSummaryText(summary);
      return { heading, summary };
    } catch (error) {
      setSummaryHeading("");
      setSummaryText(`ошибка сводки: ${error.message}`);
      return null;
    } finally {
      setIsSummarizing(false);
    }
  }

  async function createNoteInDb({ sourceType, inputText, dictatedText, heading, summary }) {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType,
        inputText,
        dictatedText,
        heading,
        summary,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to create note");
    return data.note;
  }

  async function updateNoteInDb(noteId, payload) {
    const response = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to update note");
    return data.note;
  }

  async function transcribeFile(file, sourceType = "upload") {
    setIsTranscribing(true);
    setRecStatus("отправляю в Whisper...");
    try {
      const formData = new FormData();
      formData.append("file", file, file.name || "audio.webm");
      const endpoint = isDebugEnabled() ? "/api/transcribe?debug=1" : "/api/transcribe";

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(buildTranscribeError(data, response.status));
      }

      const text = (data.text || "").trim();
      if (!text) {
        setRecStatus("пустой ответ от Whisper, попробуй снова");
        return;
      }

      setTranscript(text);
      setManualText(text);
      setRecStatus("транскрипция готова");

      const analysis = await generateSummaryFromText(text);
      const note = await createNoteInDb({
        sourceType,
        inputText: text,
        dictatedText: text,
        heading: analysis?.heading || "",
        summary: analysis?.summary || "",
      });

      await refreshNoteDetails(note.id);
    } catch (error) {
      setRecStatus(`ошибка Whisper: ${error.message}`);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function transcribeAudioBlob() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || audioChunksRef.current.length === 0) return;

    const mime = recorder.mimeType || "audio/webm";
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
    const blob = new Blob(audioChunksRef.current, { type: mime });
    const fileName = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = "";
    }

    const url = URL.createObjectURL(blob);
    recordingUrlRef.current = url;
    setLastRecordingUrl(url);
    setLastRecordingName(fileName);

    await transcribeFile(new File([blob], fileName, { type: mime }), "recording");
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    setRecStatus("обрабатываю запись...");
    resetRecordingUi();
    recorder.stop();
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicHint(
        "getUserMedia недоступен. Используй современный браузер по localhost/https или загрузи аудиофайл ниже.",
      );
      return;
    }

    try {
      if (navigator.permissions) {
        const permission = await navigator.permissions
          .query({ name: "microphone" })
          .catch(() => null);
        if (permission && permission.state === "denied") {
          setMicHint(
            "Доступ к микрофону заблокирован браузером. Разреши доступ в настройках сайта или загрузи аудиофайл ниже.",
          );
          return;
        }
      }

      setMicHint("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startLevelMeter(stream);

      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const activeStream = streamRef.current;
        if (activeStream) {
          activeStream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        stopLevelMeter();
        await transcribeAudioBlob();
      };

      recorder.start(250);
      setIsRecording(true);
      setRecSeconds(0);
      setRecStatus("запись идет — нажми еще раз чтобы остановить");
      timerRef.current = setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setMicHint(
          "Доступ к микрофону отклонен. Разреши доступ в настройках браузера или загрузи аудиофайл ниже.",
        );
      } else if (error.name === "NotFoundError") {
        setMicHint("Микрофон не найден. Подключи микрофон или загрузи аудиофайл ниже.");
      } else if (error.name === "NotReadableError") {
        setMicHint("Микрофон занят другим приложением.");
      } else {
        setMicHint(`Ошибка микрофона: ${error.message}`);
      }

      setRecStatus("нажми чтобы попробовать снова");
      resetRecordingUi();
      stopLevelMeter();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }

  async function ensureNoteBeforeGeneration() {
    const baseText = currentText;
    if (!baseText) throw new Error("Нет текста для генерации");

    if (selectedNoteId) {
      await updateNoteInDb(selectedNoteId, {
        inputText: baseText,
        dictatedText: transcript || null,
        heading: summaryHeading || null,
        summary: summaryText || null,
      });
      return selectedNoteId;
    }

    let heading = summaryHeading;
    let summary = summaryText;

    if (!heading && !summary) {
      const analysis = await generateSummaryFromText(baseText);
      heading = analysis?.heading || "";
      summary = analysis?.summary || "";
    }

    const created = await createNoteInDb({
      sourceType: transcript ? "recording" : "manual",
      inputText: baseText,
      dictatedText: transcript || null,
      heading: heading || "",
      summary: summary || "",
    });

    return created.id;
  }

  async function handleGenerate() {
    if (!canGenerate) return;

    setIsGenerating(true);
    setPost("");

    try {
      const noteId = await ensureNoteBeforeGeneration();

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: currentText,
          styleInstructions: customStyleInstructions.trim(),
          extraInstructions: extraInstructions.trim(),
          length: selectedLength,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const nextPost = (data.post || "").trim();
      if (!nextPost) {
        throw new Error("пустой ответ, попробуй снова");
      }

      setPost(nextPost);

      const selectedStyle = styles.find((s) => s.id === selectedStyleId) || null;
      const saveResponse = await fetch(`/api/notes/${noteId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postText: nextPost,
          length: selectedLength,
          extraInstructions: extraInstructions.trim() || null,
          styleId: selectedStyle?.id || null,
          styleName: selectedStyle?.name || customStyleName || null,
          styleInstructions: customStyleInstructions.trim(),
          generationSettings: {
            length: selectedLength,
            extraInstructions: extraInstructions.trim() || null,
          },
        }),
      });
      const saveData = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Не удалось сохранить сгенерированный пост");
      }

      await refreshNoteDetails(noteId);
    } catch (error) {
      setPost(`ошибка: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!post) return;

    try {
      await navigator.clipboard.writeText(post);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = post;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }

    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }

  async function handleSaveStyleProfile() {
    const name = customStyleName.trim();
    const instructions = customStyleInstructions.trim();
    if (!name || !instructions) return;

    const existing = styles.find((s) => s.id === selectedStyleId);
    const response = await fetch("/api/styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: existing?.id || null,
        name,
        instructions,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to save style");

    await loadStyles();
    setSelectedStyleId(data.style.id);
  }

  async function handleApplyStyleProfile(id) {
    setSelectedStyleId(id);
    const selected = styles.find((profile) => profile.id === id);
    if (!selected) return;
    setCustomStyleName(selected.name);
    setCustomStyleInstructions(selected.instructions);
  }

  async function handleDeleteSelectedProfile() {
    if (!selectedStyleId) return;
    const response = await fetch(`/api/styles/${selectedStyleId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to delete style");

    setSelectedStyleId("");
    setCustomStyleName("");
    setCustomStyleInstructions("");
    await loadStyles();
  }

  function startNewNoteDraft() {
    setSelectedNoteId("");
    setSelectedNote(null);
    setSimilarNotes([]);
    setTranscript("");
    setManualText("");
    setSummaryHeading("");
    setSummaryText("");
    setPost("");
  }

  const levelLabel = Math.round(audioLevel * 100);

  return (
    <>
      <header>
        <h1>Voice → Post</h1>
        <span className="subtitle">говори — получай пост</span>
      </header>

      <div className="container">
        <div>
          <div className="block-label">История заметок</div>
          <div className="artifact-block">
            <div className="artifact-actions">
              <button className="btn btn-primary" type="button" onClick={startNewNoteDraft}>
                новая заметка
              </button>
            </div>

            {notes.length ? (
              <div className="artifact-list">
                {notes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`artifact-item ${selectedNoteId === item.id ? "artifact-item-active" : ""}`}
                    onClick={() => {
                      void selectNote(item.id);
                    }}
                  >
                    <div className="artifact-meta">
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    <div className="artifact-heading">{item.heading || "Без заголовка"}</div>
                    <div className="artifact-post">{item.summary || "Без саммари"}</div>
                  </button>
                ))}
              </div>
            ) : (
              <span className="placeholder">пока нет заметок</span>
            )}
          </div>
        </div>

        <div className="mic-section">
          <div className={`waveform ${isRecording ? "visible recording" : ""}`}>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className="recording-live">
            <div className={`recording-dot ${isRecording ? "active" : ""}`} />
            <div className="rec-timer-inline">{formatSeconds(recSeconds)}</div>
            <div className="recording-level-value">lvl {levelLabel}%</div>
          </div>

          <div className="level-meter" aria-hidden="true">
            {levelBars.map((value, index) => (
              <span
                key={index}
                className={isRecording ? "active" : ""}
                style={{ height: `${10 + value * 48}px` }}
              />
            ))}
          </div>

          <button
            className={`mic-btn ${isRecording ? "recording" : ""}`}
            onClick={() => (isRecording ? stopRecording() : startRecording())}
            disabled={isTranscribing || isGenerating}
            title="Нажми и говори"
            type="button"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="2" width="6" height="13" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </button>

          <div className={`rec-status ${isRecording ? "active" : ""}`}>{recStatus}</div>
          <div className={`mic-hint ${micHint ? "visible" : ""}`}>{micHint}</div>
          <div className="model-badge">
            <span className="dot" />openai/whisper-1
          </div>

          {lastRecordingUrl ? (
            <a className="recording-download" href={lastRecordingUrl} download={lastRecordingName}>
              скачать запись ({lastRecordingName})
            </a>
          ) : null}
        </div>

        <div>
          <div className="block-label">или загрузи аудиофайл</div>
          <UploadBlock onFile={(file) => transcribeFile(file, "upload")} busy={isTranscribing || isGenerating || isSummarizing} />
        </div>

        <div>
          <div className="block-label">Транскрипция / текст заметки</div>
          <div className="transcript-block">
            <textarea
              className="manual-area"
              placeholder={INITIAL_TRANSCRIPT_PLACEHOLDER}
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="block-label">Заголовок и саммари</div>
          <div className="summary-block">
            {isSummarizing ? (
              <div className="summary-loading">
                <span className="spinner" />
                <span>генерирую заголовок и сводку...</span>
              </div>
            ) : (
              <>
                <h3 className="summary-heading">{summaryHeading || "Без заголовка"}</h3>
                <p className="summary-text">{summaryText || "Сводка отсутствует."}</p>
              </>
            )}
            <div className="style-controls">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void generateSummaryFromText(currentText);
                }}
                disabled={!currentText || isSummarizing}
              >
                обновить саммари
              </button>
            </div>
          </div>
        </div>

        {similarNotes.length ? (
          <div>
            <div className="block-label">Связанные заметки (похожесть)</div>
            <div className="artifact-block">
              <div className="artifact-list">
                {similarNotes.map((item) => (
                  <button
                    key={item.note_id || createTempId()}
                    type="button"
                    className="artifact-item"
                    onClick={() => {
                      if (item.note_id) void selectNote(item.note_id);
                    }}
                  >
                    <div className="artifact-meta">
                      <span>score {(item.similarity_score || 0).toFixed(2)}</span>
                    </div>
                    <div className="artifact-heading">{item.heading || "Без заголовка"}</div>
                    <div className="artifact-post">{item.summary || "Без саммари"}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <div className="block-label">Стили</div>
          <div className="style-block">
            <textarea
              className="style-area"
              placeholder="Опиши стиль письма: словарь, длина фраз, структура, запреты, любимые обороты..."
              value={customStyleInstructions}
              onChange={(event) => setCustomStyleInstructions(event.target.value)}
            />

            <div className="style-controls">
              <input
                className="style-name-input"
                placeholder="название стиля"
                value={customStyleName}
                onChange={(event) => setCustomStyleName(event.target.value)}
              />
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void handleSaveStyleProfile();
                }}
                disabled={!customStyleName.trim() || !customStyleInstructions.trim()}
              >
                сохранить стиль
              </button>
            </div>

            <div className="style-controls">
              <select
                className="style-select"
                value={selectedStyleId}
                onChange={(event) => {
                  void handleApplyStyleProfile(event.target.value);
                }}
              >
                <option value="">выбери сохраненный стиль</option>
                {styles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void handleDeleteSelectedProfile();
                }}
                disabled={!selectedStyleId}
              >
                удалить стиль
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="block-label">Параметры генерации</div>
          <div className="style-block">
            <div className="length-row">
              {LENGTH_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`tone-chip ${selectedLength === option.id ? "active" : ""}`}
                  onClick={() => setSelectedLength(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <textarea
              className="style-area"
              placeholder="Дополнительные инструкции (опционально): что добавить, чего избегать, форматирование и т.д."
              value={extraInstructions}
              onChange={(event) => setExtraInstructions(event.target.value)}
            />

            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                void handleGenerate();
              }}
              disabled={!canGenerate}
            >
              сгенерировать пост
            </button>
          </div>
        </div>

        <div>
          <div className="block-label">Сгенерированный пост</div>
          <div className="post-block">
            <div className="post-output">
              {isGenerating ? (
                <>
                  <span className="spinner" />
                  <span style={{ color: "var(--muted)", fontSize: ".8rem" }}>
                    генерирую пост...
                  </span>
                </>
              ) : post ? (
                post
              ) : (
                <span className="placeholder">пост появится здесь...</span>
              )}
            </div>
          </div>

          <div className="post-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              disabled={!post || isGenerating}
            >
              скопировать
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                void handleGenerate();
              }}
              disabled={!canGenerate}
            >
              перегенерировать
            </button>
          </div>

          {selectedNote?.posts?.length ? (
            <div className="artifact-block" style={{ marginTop: 12 }}>
              <div className="block-label">История постов заметки</div>
              <div className="artifact-list">
                {selectedNote.posts.map((item) => (
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
      </div>

      <div className={`toast ${showToast ? "show" : ""}`}>Скопировано!</div>
    </>
  );
}

function UploadBlock({ onFile, busy }) {
  const [fileName, setFileName] = useState("mp3, m4a, wav, ogg, webm...");
  const [isReady, setIsReady] = useState(false);
  const inputRef = useRef(null);

  return (
    <div className="upload-block">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        style={{ display: "none" }}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFileName(file.name);
          setIsReady(true);
          await onFile(file);
          event.target.value = "";
        }}
      />
      <button
        className="btn"
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        выбрать файл
      </button>
      <span className={`upload-name ${isReady ? "ready" : ""}`}>{fileName}</span>
    </div>
  );
}
