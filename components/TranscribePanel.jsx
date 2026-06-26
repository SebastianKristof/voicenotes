"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { transcribeFile } from "../lib/client-api";
import { clearLastRecording, loadLastRecording, saveLastRecording } from "../lib/recording-store";

const LANGUAGE_OPTIONS = [
  { value: "", label: "auto" },
  { value: "ru", label: "russian" },
  { value: "en", label: "english" },
];

function formatSeconds(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function TranscribePanel({ onText, disabled, compact = false }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recStatus, setRecStatus] = useState("нажми чтобы начать запись");
  const [micHint, setMicHint] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [levelBars, setLevelBars] = useState(Array.from({ length: 14 }, () => 0.06));
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastRecordingUrl, setLastRecordingUrl] = useState("");
  const [lastRecordingName, setLastRecordingName] = useState("");
  const [lastRecordingFile, setLastRecordingFile] = useState(null);
  const [uploadName, setUploadName] = useState("mp3, m4a, wav, ogg, webm...");
  const [language, setLanguage] = useState("");
  const [hasRecoveredRecording, setHasRecoveredRecording] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const cancelRecordingRef = useRef(false);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const analyserDataRef = useRef(null);
  const meterRafRef = useRef(null);
  const meterLastUpdateRef = useRef(0);
  const streamRef = useRef(null);
  const recordingUrlRef = useRef("");
  const fileInputRef = useRef(null);

  const controlsLocked = disabled || isTranscribing;
  const uploadLocked = controlsLocked || isRecording;

  useEffect(() => {
    void restoreRecording();
    return () => {
      clearTimer();
      stopLevelMeter();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
  }, []);

  async function restoreRecording() {
    const recovered = await loadLastRecording();
    if (!recovered?.blob || !recovered?.name) return;
    const file = new File([recovered.blob], recovered.name, {
      type: recovered.type || recovered.blob.type || "audio/webm",
    });
    setLastRecordingFile(file);
    setLastRecordingName(recovered.name);
    setHasRecoveredRecording(true);
    const url = URL.createObjectURL(recovered.blob);
    recordingUrlRef.current = url;
    setLastRecordingUrl(url);
    setRecStatus("найдена несохраненная запись");
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
      } catch {}
      analyserRef.current = null;
    }
    analyserDataRef.current = null;
    if (audioContextRef.current) {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      context.close().catch(() => {});
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
    } catch {}
  }

  async function handleTranscribed(file, sourceType) {
    setIsTranscribing(true);
    setRecStatus("отправляю в Whisper...");
    try {
      const text = await transcribeFile(file, { language });
      if (!text) {
        setRecStatus("пустой ответ от Whisper, попробуй снова");
        return;
      }
      setRecStatus("транскрипция готова");
      try {
        await onText({ text, sourceType, language: language || "auto" });
      } catch (error) {
        setRecStatus(`ошибка сохранения заметки: ${error.message}`);
        return;
      }
      await clearLastRecording();
      setHasRecoveredRecording(false);
    } catch (error) {
      setRecStatus(`ошибка Whisper: ${error.message}`);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function transcribeAudioBlob() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !audioChunksRef.current.length) return;

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
    const file = new File([blob], fileName, { type: mime });
    setLastRecordingFile(file);
    await saveLastRecording({ blob, name: fileName, type: mime, savedAt: new Date().toISOString() });

    await handleTranscribed(file, "recording");
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    setRecStatus("обрабатываю запись...");
    resetRecordingUi();
    recorder.stop();
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;
    cancelRecordingRef.current = true;
    audioChunksRef.current = [];
    setRecStatus("запись отменена");
    resetRecordingUi();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    stopLevelMeter();
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicHint("getUserMedia недоступен. Используй localhost/https или загрузи файл ниже.");
      return;
    }

    try {
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
      cancelRecordingRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const activeStream = streamRef.current;
        if (activeStream) {
          activeStream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        stopLevelMeter();
        if (cancelRecordingRef.current) {
          cancelRecordingRef.current = false;
          audioChunksRef.current = [];
          return;
        }
        await transcribeAudioBlob();
      };

      recorder.start(250);
      setIsRecording(true);
      setRecSeconds(0);
      setRecStatus("запись идет — нажми еще раз чтобы остановить");
      timerRef.current = setInterval(() => setRecSeconds((prev) => prev + 1), 1000);
    } catch (error) {
      setMicHint(`Ошибка микрофона: ${error.message}`);
      setRecStatus("нажми чтобы попробовать снова");
      resetRecordingUi();
      stopLevelMeter();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }

  const levelLabel = useMemo(() => Math.round(audioLevel * 100), [audioLevel]);

  const showUploadName = !compact || uploadName.includes(".");
  const canRetranscribe = !!lastRecordingFile && !controlsLocked && !isRecording;

  return (
    <div className={`transcribe-panel ${compact ? "transcribe-panel-compact" : ""}`}>
      <div className="mic-section">
        {!compact ? (
          <div className="transcribe-options">
            <label>
              язык
              <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={controlsLocked || isRecording}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value || "auto"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              type="button"
              onClick={() => lastRecordingFile && handleTranscribed(lastRecordingFile, "recording")}
              disabled={!canRetranscribe}
            >
              перераспознать
            </button>
          </div>
        ) : null}

        {!compact ? (
          <div className={`waveform ${isRecording ? "visible recording" : ""}`}>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {isRecording ? (
          <>
            <div className="recording-live">
              <div className="recording-dot active" />
              <div className="rec-timer-inline">{formatSeconds(recSeconds)}</div>
              {!compact ? <div className="recording-level-value">lvl {levelLabel}%</div> : null}
            </div>

            {!compact ? (
              <div className="level-meter" aria-hidden="true">
                {levelBars.map((value, index) => (
                  <span
                    key={index}
                    className="active"
                    style={{ height: `${10 + value * 48}px` }}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          !compact ? <div className="recording-idle-hint">Нажми кнопку и говори. После записи заметка создастся автоматически.</div> : null
        )}

        <button
          className={`mic-btn ${isRecording ? "recording" : ""}`}
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          disabled={controlsLocked}
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

        {isRecording ? (
          <button className="btn btn-danger" type="button" onClick={cancelRecording}>
            отменить запись
          </button>
        ) : null}

        <div className={`rec-status ${isRecording ? "active" : ""}`} aria-live="polite">{recStatus}</div>
        <div className={`mic-hint ${micHint ? "visible" : ""}`}>{micHint}</div>
        {!compact ? (
          <div className="model-badge">
            <span className="dot" />openai/whisper-1
          </div>
        ) : null}

        {!compact && lastRecordingUrl ? (
          <div className="recording-recovery">
            {hasRecoveredRecording ? <span>восстановлена несохраненная запись</span> : null}
            <a className="recording-download" href={lastRecordingUrl} download={lastRecordingName}>
              скачать запись ({lastRecordingName})
            </a>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await clearLastRecording();
                setHasRecoveredRecording(false);
                setLastRecordingFile(null);
                setLastRecordingName("");
                setLastRecordingUrl("");
                setRecStatus("запись удалена");
              }}
            >
              удалить запись
            </button>
          </div>
        ) : null}
      </div>

      {!compact ? (
      <div className="transcribe-upload">
        <div className="block-label">или загрузи аудиофайл</div>
        <div className="upload-block">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setUploadName(file.name);
              setLastRecordingFile(file);
              setLastRecordingName(file.name);
              await handleTranscribed(file, "upload");
              event.target.value = "";
            }}
          />
          <button
            className="btn"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLocked}
          >
            выбрать файл
          </button>
          {showUploadName ? <span className={`upload-name ${uploadName.includes(".") ? "ready" : ""}`}>{uploadName}</span> : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}
