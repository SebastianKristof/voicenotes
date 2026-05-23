"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const TONES = {
  thoughtful:
    "Вдумчивый, аналитический тон. Пост глубокий, с инсайтами. Подходит для LinkedIn или личного блога.",
  casual:
    "Разговорный, живой тон. Как будто пишешь другу. Короткие предложения, эмодзи уместны.",
  bold:
    "Дерзкий, провокационный тон. Без воды, прямо в точку. Можно использовать сильные утверждения.",
  story:
    "Формат личной истории. Начни с крючка, расскажи ситуацию, дай вывод.",
  thread:
    "Формат треда (X/Twitter). Разбей на нумерованные пункты 1/ 2/ 3/ и т.д. Каждый пункт — отдельная мысль.",
};

const INITIAL_TRANSCRIPT_PLACEHOLDER = "текст появится после записи...";

function formatSeconds(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function VoiceToPostApp() {
  const [transcript, setTranscript] = useState("");
  const [manualText, setManualText] = useState("");
  const [selectedTone, setSelectedTone] = useState("thoughtful");
  const [post, setPost] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recStatus, setRecStatus] = useState("нажми чтобы начать запись");
  const [micHint, setMicHint] = useState("");

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const currentText = useMemo(
    () => manualText.trim() || transcript.trim(),
    [manualText, transcript],
  );

  const canGenerate = !!currentText && !isGenerating;

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    };
  }, []);

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
  }

  async function transcribeFile(file) {
    setIsTranscribing(true);
    setRecStatus("⏳ отправляю в Whisper...");
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
      setRecStatus("транскрипция готова ✓");
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

    await transcribeFile(new File([blob], `rec.${ext}`, { type: mime }));
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    setRecStatus("⏳ отправляю в Whisper...");
    resetRecordingUi();
    recorder.stop();
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicHint(
        "⚠ getUserMedia недоступен. Используй современный браузер по localhost/https или загрузи аудиофайл ниже.",
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
            "⚠ Доступ к микрофону заблокирован браузером. Разреши доступ в настройках сайта или загрузи аудиофайл ниже.",
          );
          return;
        }
      }

      setMicHint("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        stream.getTracks().forEach((track) => track.stop());
        await transcribeAudioBlob();
      };

      recorder.start(250);
      setIsRecording(true);
      setRecSeconds(0);
      setRecStatus("запись идёт — нажми ещё раз чтобы остановить");
      timerRef.current = setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setMicHint(
          "⚠ Доступ к микрофону отклонён. Разреши доступ в настройках браузера или загрузи аудиофайл ниже.",
        );
      } else if (error.name === "NotFoundError") {
        setMicHint("⚠ Микрофон не найден. Подключи микрофон или загрузи аудиофайл ниже.");
      } else if (error.name === "NotReadableError") {
        setMicHint("⚠ Микрофон занят другим приложением.");
      } else {
        setMicHint(`⚠ Ошибка микрофона: ${error.message}`);
      }
      setRecStatus("нажми чтобы попробовать снова");
      resetRecordingUi();
    }
  }

  async function handleGenerate() {
    if (!currentText || isGenerating) return;

    setIsGenerating(true);
    setPost("");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentText, tone: selectedTone }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (!data.post?.trim()) {
        throw new Error("пустой ответ, попробуй снова");
      }

      setPost(data.post.trim());
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

          <div className="rec-timer" style={{ display: isRecording ? "block" : "none" }}>
            {formatSeconds(recSeconds)}
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
        </div>

        <div>
          <div className="block-label">или загрузи аудиофайл</div>
          <UploadBlock onFile={transcribeFile} busy={isTranscribing || isGenerating} />
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
              onClick={() => setTranscript("")}
              disabled={!transcript}
            >
              очистить
            </button>
            <span style={{ flex: 1 }} />
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
          <div className="block-label">Тон поста</div>
          <div className="tone-row">
            {Object.keys(TONES).map((tone) => (
              <button
                key={tone}
                className={`tone-chip ${selectedTone === tone ? "active" : ""}`}
                onClick={() => setSelectedTone(tone)}
                type="button"
              >
                {labelForTone(tone)}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            сгенерировать пост
          </button>
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
              disabled={!currentText || isGenerating}
            >
              перегенерировать
            </button>
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

function labelForTone(tone) {
  switch (tone) {
    case "thoughtful":
      return "вдумчивый";
    case "casual":
      return "разговорный";
    case "bold":
      return "дерзкий";
    case "story":
      return "история";
    case "thread":
      return "тред";
    default:
      return tone;
  }
}
