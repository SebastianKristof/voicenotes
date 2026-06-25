"use client";

import { useEffect, useState } from "react";
import AppNav from "./AppNav";
import {
  listOpenSessions,
  listStyles,
  logoutAccessSession,
  removeStyle,
  saveStyle,
  terminateOpenSession,
} from "../lib/client-api";
import { SCREEN_STATUS, useScreenState } from "../lib/use-screen-state";

const THEME_KEY = "voicenotes_theme";

export default function SettingsScreen() {
  const screen = useScreenState();
  const [styles, setStyles] = useState([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [theme, setTheme] = useState("dark");
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) setTheme(savedTheme);
    void loadInitialData();
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function fetchStyles() {
    setStyles(await listStyles());
  }

  async function fetchSessions() {
    setSessions(await listOpenSessions());
  }

  async function loadInitialData() {
    await screen.runAction(
      "load",
      async () => {
        await Promise.all([fetchStyles(), fetchSessions()]);
      },
      { phase: SCREEN_STATUS.LOADING, rethrow: false },
    );
  }

  function pickStyle(id) {
    setSelectedStyleId(id);
    const style = styles.find((item) => item.id === id);
    if (!style) {
      setName("");
      setInstructions("");
      return;
    }
    setName(style.name);
    setInstructions(style.instructions);
  }

  async function onSave() {
    if (!name.trim() || !instructions.trim()) return;

    await screen.runAction(
      "save",
      async () => {
        const saved = await saveStyle({
          id: selectedStyleId || null,
          name: name.trim(),
          instructions: instructions.trim(),
        });
        await fetchStyles();
        setSelectedStyleId(saved.id);
      },
      { rethrow: false },
    );
  }

  async function onDelete() {
    if (!selectedStyleId) return;

    await screen.runAction(
      "delete",
      async () => {
        await removeStyle(selectedStyleId);
        setSelectedStyleId("");
        setName("");
        setInstructions("");
        await fetchStyles();
      },
      { rethrow: false },
    );
  }

  async function onTerminateSession(sessionId) {
    await screen.runAction(
      "terminateSession",
      async () => {
        await terminateOpenSession(sessionId);
        await fetchSessions();
      },
      { rethrow: false },
    );
  }

  async function onRefreshSessions() {
    await screen.runAction(
      "refreshSessions",
      async () => {
        await fetchSessions();
      },
      { rethrow: false },
    );
  }

  async function onSignOutCurrentSession() {
    await screen.runAction(
      "signOut",
      async () => {
        await logoutAccessSession();
        window.location.assign("/access");
      },
      { rethrow: false },
    );
  }

  const statusTextByAction = {
    load: "загружаю настройки...",
    save: "сохраняю стиль...",
    delete: "удаляю стиль...",
    refreshSessions: "обновляю список сессий...",
    terminateSession: "завершаю сессию...",
    signOut: "завершаю текущую сессию...",
  };

  const statusText = screen.isBusy ? (statusTextByAction[screen.activeAction] || "выполняю действие...") : "";

  return (
    <>
      <header>
        <h1>Settings</h1>
        <span className="subtitle">общие настройки и стили</span>
      </header>
      <AppNav />

      <div className="container">
        <div className="status-strip" aria-live="polite">
          {statusText || "управление темой и стилями"}
        </div>

        <div>
          <div className="block-label">Тема</div>
          <div className="style-block">
            <div className="length-row">
              <button className={`tone-chip ${theme === "dark" ? "active" : ""}`} type="button" onClick={() => setTheme("dark")}>темная</button>
              <button className={`tone-chip ${theme === "light" ? "active" : ""}`} type="button" onClick={() => setTheme("light")}>светлая</button>
            </div>
          </div>
        </div>

        <div>
          <div className="block-label">Стили</div>
          <div className="style-block">
            <div className="style-controls">
              <select className="style-select" value={selectedStyleId} onChange={(event) => pickStyle(event.target.value)}>
                <option value="">новый стиль</option>
                {styles.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="style-controls">
              <input className="style-name-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="название стиля" />
            </div>

            <textarea className="style-area" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="инструкции стиля" />

            <div className="style-controls desktop-actions">
              <button className="btn btn-primary" type="button" onClick={onSave} disabled={!name.trim() || !instructions.trim() || screen.isBusy}>
                сохранить
              </button>
              <button className="btn" type="button" onClick={onDelete} disabled={!selectedStyleId || screen.isBusy}>
                удалить
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="block-label">Открытые сессии</div>
          <div className="style-block">
            <div className="style-controls">
              <button className="btn" type="button" onClick={onRefreshSessions} disabled={screen.isBusy}>
                обновить список
              </button>
              <button className="btn" type="button" onClick={onSignOutCurrentSession} disabled={screen.isBusy}>
                выйти с этого устройства
              </button>
            </div>

            <div className="artifact-list">
              {sessions.length ? sessions.map((session) => (
                <div key={session.id} className="artifact-item">
                  <div className="artifact-meta wrap-meta">
                    <span>ID: {session.id}</span>
                    <span>{session.current ? "текущая" : "активна"}</span>
                  </div>
                  <div className="artifact-post mono-wrap">
                    создана: {new Date(session.created_at).toLocaleString()}
                  </div>
                  <div className="artifact-post mono-wrap">
                    last seen: {new Date(session.last_seen_at).toLocaleString()}
                  </div>
                  <div className="artifact-post mono-wrap">
                    ip: {session.last_seen_ip || session.created_ip || "unknown"}
                  </div>
                  <div className="artifact-post mono-wrap">
                    ua: {session.last_seen_user_agent || session.user_agent || "unknown"}
                  </div>
                  <div className="artifact-actions">
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => onTerminateSession(session.id)}
                      disabled={screen.isBusy}
                    >
                      завершить
                    </button>
                  </div>
                </div>
              )) : (
                <span className="placeholder">нет открытых сессий</span>
              )}
            </div>
          </div>
        </div>

        <div className="mobile-action-bar">
          <button className="btn btn-primary" type="button" onClick={onSave} disabled={!name.trim() || !instructions.trim() || screen.isBusy}>
            сохранить
          </button>
          <button className="btn" type="button" onClick={onDelete} disabled={!selectedStyleId || screen.isBusy}>
            удалить
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
