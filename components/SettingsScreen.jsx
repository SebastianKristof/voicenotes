"use client";

import { useEffect, useState } from "react";
import AppNav from "./AppNav";
import { listStyles, removeStyle, saveStyle } from "../lib/client-api";
import { SCREEN_STATUS, useScreenState } from "../lib/use-screen-state";

const THEME_KEY = "voicenotes_theme";

export default function SettingsScreen() {
  const screen = useScreenState();
  const [styles, setStyles] = useState([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) setTheme(savedTheme);
    void loadStyles();
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function loadStyles() {
    await screen.runAction(
      "load",
      async () => {
        setStyles(await listStyles());
      },
      { phase: SCREEN_STATUS.LOADING, rethrow: false },
    );
  }

  function pickStyle(id) {
    setSelectedStyleId(id);
    const style = styles.find((item) => item.id === id);
    if (!style) return;
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
        await loadStyles();
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
        await loadStyles();
      },
      { rethrow: false },
    );
  }

  const statusTextByAction = {
    load: "загружаю стили...",
    save: "сохраняю стиль...",
    delete: "удаляю стиль...",
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
