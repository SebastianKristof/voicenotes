"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const LENGTH_OPTIONS = [
  { id: "short", label: "короткий" },
  { id: "medium", label: "средний" },
  { id: "long", label: "длинный" },
];

const INITIAL_TRANSCRIPT_PLACEHOLDER = "текст появится после записи...";
const STYLE_STORAGE_KEY = "voice_to_post_style_profiles_v1";
const ARTIFACT_STORAGE_KEY = "voice_to_post_artifacts_v1";

function formatSeconds(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function readJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const [styleProfiles, setStyleProfiles] = useState([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");

  const [selectedLength, setSelectedLength] = useState("medium");
  const [extraInstructions, setExtraInstructions] = useState("");

  const [artifacts, setArtifacts] = useState([]);

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
    const savedProfiles = readJsonArray(STYLE_STORAGE_KEY);
    const savedArtifacts = readJsonArray(ARTIFACT_STORAGE_KEY);
    setStyleProfiles(savedProfiles);
    setArtifacts(savedArtifacts);
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

  function persistStyleProfiles(next) {
    setStyleProfiles(next);
    localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(next));
  }

  function persistArtifacts(next) {
    const trimmed = next.slice(0, 100);
    setArtifacts(trimmed);
    localStorage.setItem(ARTIFACT_STORAGE_KEY, JSON.stringify(trimmed));
  }

  function saveArtifact({ nextTranscript, nextPost, nextHeading, nextSummary }) {
    if (!nextTranscript && !nextPost && !nextSummary) return;

    const selectedProfile = styleProfiles.find((profile) => profile.id === selectedStyleId);
    const item = {
      id: createId(),
      createdAt: new Date().toISOString(),
      transcript: nextTranscript || "",
      heading: nextHeading || "",
      summary: nextSummary || "",
      post: nextPost || "",
      length: selectedLength,
      extraInstructions: extraInstructions.trim(),
      styleProfileName: selectedProfile?.name || "",
      styleInstructions: customStyleInstructions.trim(),
      recordingFileName: lastRecordingName || "",
    };

    setArtifacts((prev) => {
      const next = [item, ...prev].slice(0, 100);
      localStorage.setItem(ARTIFACT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
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

  async function generateSummaryFromTranscript(text) {
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

  async function transcribeFile(file) {
    setIsTranscribing(true);
    setRecStatus("отправляю в Whisper...");
    try {
      const formData = new FormData();
      formData.append("file", file, file.name || "audio.webm");
      formData.append("model", "openai/whisper-large-v3");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const text = (data.text || "").trim();
      if (!text) {
        setRecStatus("пустой ответ от Whisper, попробуй снова");
        return;
      }

      setTranscript(text);
      setRecStatus("транскрипция готова");

      const analysis = await generateSummaryFromTranscript(text);
      saveArtifact({
        nextTranscript: text,
        nextHeading: analysis?.heading || "",
        nextSummary: analysis?.summary || "",
        nextPost: "",
      });
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

    await transcribeFile(new File([blob], fileName, { type: mime }));
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

  async function handleGenerate() {
    if (!currentText || isGenerating || !customStyleInstructions.trim()) return;

    setIsGenerating(true);
    setPost("");

    try {
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

      if (!data.post?.trim()) {
        throw new Error("пустой ответ, попробуй снова");
      }

      const nextPost = data.post.trim();
      setPost(nextPost);
      saveArtifact({
        nextTranscript: currentText,
        nextHeading: summaryHeading,
        nextSummary: summaryText,
        nextPost,
      });
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

  function handleSaveStyleProfile() {
    const name = customStyleName.trim();
    const instructions = customStyleInstructions.trim();
    if (!name || !instructions) return;

    const next = [
      { id: createId(), name, instructions },
      ...styleProfiles.filter((profile) => profile.name.toLowerCase() !== name.toLowerCase()),
    ];

    persistStyleProfiles(next);
    const selected = next.find((profile) => profile.name === name);
    if (selected) {
      setSelectedStyleId(selected.id);
    }
  }

  function handleApplyStyleProfile(id) {
    setSelectedStyleId(id);
    const selected = styleProfiles.find((profile) => profile.id === id);
    if (!selected) return;
    setCustomStyleName(selected.name);
    setCustomStyleInstructions(selected.instructions);
  }

  function handleDeleteSelectedProfile() {
    if (!selectedStyleId) return;
    const next = styleProfiles.filter((profile) => profile.id !== selectedStyleId);
    persistStyleProfiles(next);
    setSelectedStyleId("");
  }

  function exportArtifacts() {
    if (!artifacts.length) return;
    const blob = new Blob([JSON.stringify(artifacts, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice-to-post-artifacts-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const levelLabel = Math.round(audioLevel * 100);

  return (
    <>
      <header>
        <h1>Voice → Post</h1>
        <span className="subtitle">говори — получай пост</span>
      </header>

      <div className="container">
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
            <span className="dot" />openai/whisper-large-v3
          </div>

          {lastRecordingUrl ? (
            <a className="recording-download" href={lastRecordingUrl} download={lastRecordingName}>
              скачать запись ({lastRecordingName})
            </a>
          ) : null}
        </div>

        <div>
          <div className="block-label">или загрузи аудиофайл</div>
          <UploadBlock onFile={transcribeFile} busy={isTranscribing || isGenerating || isSummarizing} />
        </div>

        <div>
          <div className="block-label">Транскрипция</div>
          <div className="transcript-block">
            <div className={`transcript-text ${transcript ? "has-content" : ""}`}>
              {transcript ? (
                transcript
              ) : (
                <span className="placeholder">{INITIAL_TRANSCRIPT_PLACEHOLDER}</span>
              )}
            </div>
          </div>
          <div className="controls-inline">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setTranscript("");
                setSummaryHeading("");
                setSummaryText("");
              }}
              disabled={!transcript}
            >
              очистить
            </button>
            <span style={{ flex: 1 }} />
          </div>
        </div>

        <div>
          <div className="block-label">Заголовок и сводка</div>
          <div className="summary-block">
            {isSummarizing ? (
              <div className="summary-loading">
                <span className="spinner" />
                <span>генерирую заголовок и сводку...</span>
              </div>
            ) : summaryHeading || summaryText ? (
              <>
                <h3 className="summary-heading">{summaryHeading || "Без заголовка"}</h3>
                <p className="summary-text">{summaryText || "Сводка отсутствует."}</p>
              </>
            ) : (
              <span className="placeholder">после транскрипции здесь появятся заголовок и сводка</span>
            )}
          </div>
        </div>

        <div className="divider">или введи текст вручную</div>

        <div className="transcript-block">
          <div className="block-label">Ручной ввод</div>
          <textarea
            className="manual-area"
            placeholder="вставь или напиши свои мысли здесь..."
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
          />
        </div>

        <div>
          <div className="block-label">Выбранный стиль</div>
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
                onClick={handleSaveStyleProfile}
                disabled={!customStyleName.trim() || !customStyleInstructions.trim()}
              >
                сохранить стиль
              </button>
            </div>

            <div className="style-controls">
              <select
                className="style-select"
                value={selectedStyleId}
                onChange={(event) => handleApplyStyleProfile(event.target.value)}
              >
                <option value="">выбери сохраненный стиль</option>
                {styleProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                type="button"
                onClick={handleDeleteSelectedProfile}
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
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              сгенерировать пост
            </button>
          </div>
        </div>

        <div>
          <div className="block-label">Готовый пост</div>
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
              onClick={handleCopy}
              disabled={!post || isGenerating}
            >
              скопировать
            </button>
            <button
              className="btn"
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              перегенерировать
            </button>
          </div>
        </div>

        <div>
          <div className="block-label">Артефакты</div>
          <div className="artifact-block">
            <div className="artifact-actions">
              <button className="btn" type="button" onClick={exportArtifacts} disabled={!artifacts.length}>
                экспорт JSON
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  persistArtifacts([]);
                }}
                disabled={!artifacts.length}
              >
                очистить историю
              </button>
            </div>

            {artifacts.length ? (
              <div className="artifact-list">
                {artifacts.slice(0, 6).map((item) => (
                  <div className="artifact-item" key={item.id}>
                    <div className="artifact-meta">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      <span>{item.length || "medium"}</span>
                    </div>
                    {item.heading ? <div className="artifact-heading">{item.heading}</div> : null}
                    {item.post ? <div className="artifact-post">{item.post.slice(0, 180)}...</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <span className="placeholder">история пока пустая</span>
            )}
          </div>
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
